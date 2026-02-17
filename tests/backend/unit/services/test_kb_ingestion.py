"""Unit tests for KBIngestionService."""

import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.kb_ingestion import KBIngestionService


pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Initialization & lifecycle
# ---------------------------------------------------------------------------


class TestKBIngestionServiceInit:

    def test_default_state(self):
        svc = KBIngestionService()
        assert svc.name == "kb_ingestion"
        assert svc.is_running is False

    @pytest.mark.asyncio
    async def test_startup(self):
        svc = KBIngestionService()
        await svc.startup()
        assert svc.is_running is True

    @pytest.mark.asyncio
    async def test_startup_idempotent(self):
        svc = KBIngestionService()
        await svc.startup()
        await svc.startup()
        assert svc.is_running is True

    @pytest.mark.asyncio
    async def test_shutdown(self):
        svc = KBIngestionService()
        await svc.startup()
        await svc.shutdown()
        assert svc.is_running is False

    @pytest.mark.asyncio
    async def test_health_check_running(self):
        svc = KBIngestionService()
        await svc.startup()
        healthy, msg = await svc.health_check()
        assert healthy is True
        assert msg == "ok"
        await svc.shutdown()

    @pytest.mark.asyncio
    async def test_health_check_not_running(self):
        svc = KBIngestionService()
        healthy, msg = await svc.health_check()
        assert healthy is False
        assert "not running" in msg


# ---------------------------------------------------------------------------
# detect_file_type
# ---------------------------------------------------------------------------


class TestDetectFileType:

    def test_fallback_pdf(self):
        svc = KBIngestionService()
        # Test extension-based detection by creating temp files
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"not a real pdf")
            f.flush()
            result = svc.detect_file_type(f.name)
        os.unlink(f.name)
        # Result should be pdf (via magic or extension fallback)
        assert "pdf" in result or "octet" in result

    def test_fallback_txt(self):
        svc = KBIngestionService()
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w") as f:
            f.write("hello world")
            f.flush()
            result = svc.detect_file_type(f.name)
        os.unlink(f.name)
        assert "text" in result

    def test_fallback_md(self):
        svc = KBIngestionService()
        with tempfile.NamedTemporaryFile(suffix=".md", delete=False, mode="w") as f:
            f.write("# Title")
            f.flush()
            result = svc.detect_file_type(f.name)
        os.unlink(f.name)
        # Could be text/markdown or text/plain depending on magic
        assert "text" in result or "markdown" in result


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------


class TestTextExtraction:

    def test_extract_text_from_txt(self):
        svc = KBIngestionService()
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w", encoding="utf-8") as f:
            f.write("Hello, this is a test document.\nWith two lines.")
            path = f.name

        try:
            text = svc.extract_text_from_txt(path)
            assert "Hello, this is a test document." in text
            assert "With two lines." in text
        finally:
            os.unlink(path)

    def test_extract_text_from_markdown(self):
        svc = KBIngestionService()
        with tempfile.NamedTemporaryFile(suffix=".md", delete=False, mode="w", encoding="utf-8") as f:
            f.write("# Heading\n\nSome **bold** text.")
            path = f.name

        try:
            text = svc.extract_text_from_markdown(path)
            assert "# Heading" in text
            assert "bold" in text
        finally:
            os.unlink(path)

    def test_extract_text_from_pdf_with_mock(self):
        """Test PDF extraction using a mocked PdfReader."""
        svc = KBIngestionService()

        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = "Page one content."
        mock_page2 = MagicMock()
        mock_page2.extract_text.return_value = "Page two content."

        mock_reader = MagicMock()
        mock_reader.pages = [mock_page1, mock_page2]

        with patch("pypdf.PdfReader", return_value=mock_reader):
            result = svc.extract_text_from_pdf("fake.pdf")

        assert "Page one content." in result
        assert "Page two content." in result
        assert "\n\n" in result


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------


class TestChunkText:

    def test_chunk_text_basic(self):
        svc = KBIngestionService()
        text = "Hello world. " * 200  # a moderate-length text
        chunks = svc.chunk_text(text, chunk_size=50, chunk_overlap=10)
        assert len(chunks) > 0
        for i, chunk in enumerate(chunks):
            assert "content" in chunk
            assert "index" in chunk
            assert chunk["index"] == i
            assert "metadata" in chunk
            assert "chunk_length" in chunk["metadata"]
            assert len(chunk["content"]) > 0

    def test_chunk_text_short_text_single_chunk(self):
        svc = KBIngestionService()
        text = "Short text."
        chunks = svc.chunk_text(text, chunk_size=500, chunk_overlap=50)
        assert len(chunks) == 1
        assert chunks[0]["content"] == "Short text."
        assert chunks[0]["index"] == 0

    def test_chunk_text_empty_text(self):
        svc = KBIngestionService()
        chunks = svc.chunk_text("", chunk_size=500, chunk_overlap=50)
        # Empty text should produce no chunks
        assert len(chunks) == 0

    def test_chunk_text_preserves_order(self):
        svc = KBIngestionService()
        paragraphs = [f"Paragraph {i}. " * 30 for i in range(10)]
        text = "\n\n".join(paragraphs)
        chunks = svc.chunk_text(text, chunk_size=100, chunk_overlap=20)
        # Indices should be sequential
        for i, chunk in enumerate(chunks):
            assert chunk["index"] == i

    def test_chunk_text_custom_separators(self):
        svc = KBIngestionService()
        text = "Section A|||Section B|||Section C"
        # Even with custom separators, the splitter handles them
        chunks = svc.chunk_text(
            text, chunk_size=500, chunk_overlap=0, separators=["|||", " ", ""]
        )
        assert len(chunks) >= 1


# ---------------------------------------------------------------------------
# Ingestion pipeline (process_source)
# ---------------------------------------------------------------------------


class TestProcessSource:

    @pytest.mark.asyncio
    async def test_process_source_text_document(self):
        """Test the full ingestion pipeline with a text source."""
        svc = KBIngestionService()
        await svc.startup()

        source_id = uuid4()
        project_id = uuid4()

        # Create a mock KBSource
        mock_source = MagicMock()
        mock_source.id = source_id
        mock_source.project_id = project_id
        mock_source.source_type = "text"
        mock_source.status = "pending"
        mock_source.chunk_count = 0

        # Create a temp file for extraction
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w", encoding="utf-8") as f:
            f.write("This is test content for ingestion. " * 50)
            mock_source.source_path = f.name

        try:
            # Mock the database session
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_source
            mock_db.execute.return_value = mock_result

            with patch("app.services.kb_ingestion.select"), \
                 patch("app.services.kb_ingestion.KBChunk", MagicMock()) as MockChunk:
                # The KBChunk import inside process_source needs patching
                with patch.dict("sys.modules", {}):
                    pass

                # Patch the imports inside process_source
                mock_kb_source = MagicMock()
                mock_kb_chunk = MagicMock()

                with patch("app.services.kb_ingestion.select") as mock_select:
                    mock_db.execute.return_value = mock_result

                    await svc.process_source(source_id, mock_db)

                    # Verify status was set to processing then completed
                    assert mock_source.status == "completed"
                    assert mock_source.chunk_count > 0
                    mock_db.commit.assert_awaited()
        finally:
            os.unlink(mock_source.source_path)
            await svc.shutdown()

    @pytest.mark.asyncio
    async def test_process_source_not_found(self):
        """Test pipeline when source is not found in DB."""
        svc = KBIngestionService()
        await svc.startup()

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        with patch("app.services.kb_ingestion.select"):
            # Should return early without error
            await svc.process_source(uuid4(), mock_db)

        await svc.shutdown()
