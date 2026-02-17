"""KBIngestionService - Document processing and chunking for knowledge base."""

import logging
import os
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.kernel.base import BaseKernelService

logger = logging.getLogger(__name__)


class KBIngestionService(BaseKernelService):
    """
    Kernel service for knowledge base document ingestion.

    Handles document text extraction (PDF, text, markdown) and
    chunking using RecursiveCharacterTextSplitter.
    """

    def __init__(self) -> None:
        self._running = False

    # -- BaseKernelService lifecycle -----------------------------------------

    @property
    def name(self) -> str:
        return "kb_ingestion"

    @property
    def is_running(self) -> bool:
        return self._running

    async def startup(self) -> None:
        if self._running:
            return
        self._running = True
        logger.info("KBIngestionService started")

    async def shutdown(self) -> None:
        self._running = False
        logger.info("KBIngestionService stopped")

    async def health_check(self) -> Tuple[bool, str]:
        if not self._running:
            return False, "service not running"
        return True, "ok"

    # -- Document Extraction -------------------------------------------------

    def detect_file_type(self, file_path: str) -> str:
        """Detect MIME type of a file using python-magic."""
        try:
            import magic
            mime = magic.from_file(file_path, mime=True)
            return mime
        except Exception as exc:
            logger.warning("magic detection failed for %s: %s", file_path, exc)
            # Fallback to extension-based detection
            ext = os.path.splitext(file_path)[1].lower()
            ext_map = {
                ".pdf": "application/pdf",
                ".txt": "text/plain",
                ".md": "text/markdown",
            }
            return ext_map.get(ext, "application/octet-stream")

    def extract_text_from_pdf(self, file_path: str) -> str:
        """Extract text from all pages of a PDF file using pypdf."""
        from pypdf import PdfReader
        from pypdf.errors import PdfReadError

        try:
            reader = PdfReader(file_path)
            pages = []
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    pages.append(text)
            return "\n\n".join(pages)
        except PdfReadError as exc:
            logger.error("Corrupt or unreadable PDF %s: %s", file_path, exc)
            return ""
        except Exception as exc:
            logger.error("Unexpected error reading PDF %s: %s", file_path, exc)
            return ""

    def extract_text_from_txt(self, file_path: str) -> str:
        """Read plain text files with UTF-8 encoding."""
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    def extract_text_from_markdown(self, file_path: str) -> str:
        """Read markdown files (same as text)."""
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    def extract_text_from_html(self, file_path: str) -> str:
        """Extract text from HTML, stripping script/style/nav/footer tags."""
        from bs4 import BeautifulSoup

        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            html = f.read()
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        # Collapse multiple blank lines
        import re
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text

    def extract_text_from_csv(self, file_path: str) -> str:
        """Extract text from CSV, formatting as 'header: value' records."""
        import csv

        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f)
            rows = list(reader)
        if not rows:
            return ""
        headers = rows[0]
        records = []
        for row in rows[1:]:
            parts = []
            for i, val in enumerate(row):
                header = headers[i] if i < len(headers) else f"col_{i}"
                parts.append(f"{header}: {val}")
            records.append("\n".join(parts))
        return "\n\n".join(records)

    def extract_text_from_image_ocr(self, file_path: str) -> str:
        """Extract text from image using pytesseract OCR."""
        try:
            import pytesseract
            from PIL import Image

            image = Image.open(file_path)
            text = pytesseract.image_to_string(image)
            return text.strip()
        except Exception as exc:
            logger.error("OCR extraction failed for %s: %s", file_path, exc)
            return ""

    async def extract_text_from_image_vision(
        self, file_path: str, ollama_url: str = "http://ollama:11434"
    ) -> str:
        """Extract text from image using Ollama vision model (llava)."""
        import base64
        import httpx

        try:
            with open(file_path, "rb") as f:
                image_data = base64.b64encode(f.read()).decode("utf-8")

            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{ollama_url}/api/generate",
                    json={
                        "model": "llava",
                        "prompt": "Describe this image in detail. Extract all visible text, labels, and information.",
                        "images": [image_data],
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                return resp.json().get("response", "").strip()
        except httpx.ConnectError:
            logger.error("Vision extraction failed for %s: cannot connect to Ollama at %s", file_path, ollama_url)
            return ""
        except httpx.TimeoutException:
            logger.error("Vision extraction timed out for %s (Ollama at %s)", file_path, ollama_url)
            return ""
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Vision extraction HTTP error for %s: status=%d body=%s",
                file_path, exc.response.status_code, exc.response.text[:200],
            )
            return ""
        except Exception as exc:
            logger.error("Vision extraction failed for %s: %s", file_path, exc)
            return ""

    # -- Chunking Logic ------------------------------------------------------

    def chunk_text(
        self,
        text: str,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
        separators: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Split text into ~500-token chunks using a tiktoken-aware splitter.

        Args:
            text: Full document text.
            chunk_size: Target chunk size in tokens.
            chunk_overlap: Overlap between consecutive chunks in tokens.
            separators: Custom separator list. Defaults to paragraph/line/word/char.

        Returns:
            List of dicts with content, index, and metadata.
        """
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        if separators is None:
            separators = ["\n\n", "\n", " ", ""]

        splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            model_name="gpt-3.5-turbo",
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=separators,
        )

        documents = splitter.create_documents([text])
        chunks = []
        for idx, doc in enumerate(documents):
            chunks.append({
                "content": doc.page_content,
                "index": idx,
                "metadata": {
                    "chunk_length": len(doc.page_content),
                },
            })

        return chunks

    # -- Main Processing Method ----------------------------------------------

    async def process_source(
        self,
        source_id: UUID,
        db: AsyncSession,
    ) -> None:
        """
        Process a KBSource: extract text, chunk it, and create KBChunk records.

        Updates KBSource status through pending -> processing -> completed/failed.
        """
        from app.models.kb_source import KBSource
        from app.models.kb_chunk import KBChunk

        # Fetch source record
        result = await db.execute(
            select(KBSource).where(KBSource.id == source_id)
        )
        source = result.scalar_one_or_none()
        if source is None:
            logger.error("KBSource %s not found", source_id)
            return

        # Update status to processing
        source.status = "processing"
        await db.commit()

        try:
            file_path = source.source_path
            source_type = source.source_type

            # Extract text based on source type
            if source_type == "pdf":
                full_text = self.extract_text_from_pdf(file_path)
            elif source_type == "text":
                full_text = self.extract_text_from_txt(file_path)
            elif source_type == "markdown":
                full_text = self.extract_text_from_markdown(file_path)
            else:
                raise ValueError(f"Unsupported source type: {source_type}")

            if not full_text.strip():
                raise ValueError("No text extracted from document")

            # Chunk the text
            chunks = self.chunk_text(full_text)
            logger.info(
                "Source %s: extracted %d chars, produced %d chunks",
                source_id, len(full_text), len(chunks),
            )

            # Create KBChunk records
            for chunk_data in chunks:
                chunk = KBChunk(
                    source_id=source_id,
                    project_id=source.project_id,
                    content=chunk_data["content"],
                    chunk_index=chunk_data["index"],
                    chunk_metadata=chunk_data["metadata"],
                )
                db.add(chunk)

            # Update source with completion status
            source.chunk_count = len(chunks)
            source.status = "completed"
            await db.commit()

            logger.info(
                "Source %s processed successfully: %d chunks created",
                source_id, len(chunks),
            )

        except Exception as exc:
            logger.error("Failed to process source %s: %s", source_id, exc)
            # Refresh source in case of rollback
            await db.rollback()
            result = await db.execute(
                select(KBSource).where(KBSource.id == source_id)
            )
            source = result.scalar_one_or_none()
            if source:
                source.status = "failed"
                await db.commit()
            raise
