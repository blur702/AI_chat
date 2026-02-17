#!/usr/bin/env python3
"""Seed help topics for the KB Builder Wizard.

Usage:
    docker exec workstation-backend python scripts/seed_kb_builder_help_topics.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import AsyncSessionLocal  # noqa: E402
from sqlalchemy import text  # noqa: E402

TOPICS = [
    {
        "slug": "kb-what-are-embeddings",
        "title": "What Are Embeddings?",
        "section_id": "kb-builder",
        "body": """## What Are Embeddings?

**Vector embeddings** are numerical representations of text that capture semantic meaning. Each piece of text is converted into an array of floating-point numbers (a "vector"), typically with hundreds or thousands of dimensions.

### Why Vectors?

Traditional keyword search only finds exact matches. Embeddings enable **semantic search** — finding content by meaning rather than exact words. For example, a search for "automobile" would also match documents about "cars" and "vehicles."

### How It Works

1. An **embedding model** (like nomic-embed-text) processes your text
2. It outputs a vector — e.g., `[0.023, -0.156, 0.891, ...]` with 1024 dimensions
3. Similar meanings produce vectors that are **close together** in high-dimensional space
4. Search works by comparing the angle between vectors (cosine similarity)

This is the foundation of **Retrieval-Augmented Generation (RAG)** — giving AI models access to your custom knowledge.""",
    },
    {
        "slug": "kb-why-vectorize",
        "title": "Why Vectorize Documents?",
        "section_id": "kb-builder",
        "body": """## Why Vectorize Documents?

Vectorizing your documents creates a **searchable knowledge base** that AI can draw from during conversations.

### Benefits

- **Semantic search**: Find relevant content by meaning, not just keywords
- **Context injection**: Automatically provide relevant background to AI responses
- **Custom knowledge**: Teach the AI about your specific domain, codebase, or documentation
- **Persistent memory**: Knowledge survives across conversation sessions

### Use Cases

- Upload API documentation to help the AI generate correct code
- Index your company's style guide for consistent content generation
- Store research papers for literature review assistance
- Build a FAQ database for automated customer support""",
    },
    {
        "slug": "kb-file-types",
        "title": "Supported File Types",
        "section_id": "kb-builder",
        "body": """## Supported File Types

The KB Builder accepts the following formats:

| Format | Extension | Extraction Method |
|--------|-----------|-------------------|
| PDF | `.pdf` | Text layer extraction via pypdf |
| Plain Text | `.txt` | Direct UTF-8 read |
| Markdown | `.md` | Direct UTF-8 read |
| HTML | `.html`, `.htm` | BeautifulSoup (strips scripts, styles, nav) |
| CSV | `.csv` | Formatted as "header: value" records |
| Images | `.jpg`, `.jpeg`, `.png` | OCR (Tesseract) or Vision Model (LLaVA) |

### Size Limits

Each file can be up to **50 MB**. For very large documents, consider splitting them into smaller files for better chunking control.""",
    },
    {
        "slug": "kb-text-extraction",
        "title": "Text Extraction Methods",
        "section_id": "kb-builder",
        "body": """## Text Extraction Methods

Different file types require different extraction strategies:

### PDF Extraction
Uses **pypdf** to extract text from each page. Works well for text-based PDFs but may struggle with scanned documents (use OCR instead).

### HTML Extraction
Uses **BeautifulSoup** to parse HTML and extract meaningful text. Automatically removes `<script>`, `<style>`, `<nav>`, `<footer>`, and `<header>` tags to focus on content.

### CSV Extraction
Converts tabular data into readable text by formatting each row as "header: value" pairs. This makes the data meaningful for embedding models.

### Image Extraction
Two options available:
- **OCR**: Uses Tesseract to read visible text from images
- **Vision Model**: Uses LLaVA to describe the full image content""",
    },
    {
        "slug": "kb-ocr-explained",
        "title": "OCR (Optical Character Recognition)",
        "section_id": "kb-builder",
        "body": """## OCR (Optical Character Recognition)

OCR converts images of text into machine-readable text. The KB Builder uses **Tesseract**, the most widely-used open-source OCR engine.

### When to Use OCR

- Screenshots containing text
- Scanned documents
- Photos of whiteboards or printed material
- Any image where you want to extract **visible text only**

### Limitations

- Works best with clear, high-contrast text
- May struggle with handwriting, unusual fonts, or low resolution
- Only extracts text — ignores diagrams, charts, and visual layout
- For richer descriptions, use the **Vision Model** option instead""",
    },
    {
        "slug": "kb-vision-models",
        "title": "Vision Model Descriptions",
        "section_id": "kb-builder",
        "body": """## Vision Model Descriptions

Vision models like **LLaVA** can "see" and describe images, going far beyond simple OCR.

### What Vision Models Extract

- All visible text (like OCR)
- Descriptions of diagrams, charts, and graphs
- Layout and structural information
- Colors, shapes, and visual elements
- Contextual understanding of the image content

### When to Use Vision Models

- Diagrams and flowcharts
- Screenshots of UIs (captures layout + text)
- Charts and data visualizations
- Any image where context matters more than just text

### Trade-offs

- **Slower** than OCR (requires LLM inference)
- Requires an Ollama model with vision capabilities (e.g., `llava`)
- Output is a natural language description, not exact text reproduction""",
    },
    {
        "slug": "kb-chunking-overview",
        "title": "Document Chunking",
        "section_id": "kb-builder",
        "body": """## Document Chunking

Chunking is the process of splitting documents into smaller, manageable pieces for embedding.

### Why Chunk?

1. **Embedding models have input limits** — most work best with shorter text
2. **Precision** — smaller chunks mean more specific search results
3. **Context windows** — retrieved chunks must fit within the AI's context
4. **Relevance** — a whole document might be mostly irrelevant; chunks let you find the exact relevant section

### The Chunking Strategy

The KB Builder uses **recursive character text splitting** with tiktoken tokenization:
1. First tries to split on paragraph breaks (`\\n\\n`)
2. Then on line breaks (`\\n`)
3. Then on spaces
4. Finally on individual characters

This hierarchical approach preserves document structure as much as possible.""",
    },
    {
        "slug": "kb-chunk-size",
        "title": "Chunk Size Parameter",
        "section_id": "kb-builder",
        "body": """## Chunk Size Parameter

The **chunk size** (in tokens) controls how large each text segment is.

### Guidelines

| Size | Best For | Trade-off |
|------|----------|-----------|
| 100-200 | FAQ entries, definitions | Very precise but may lose context |
| 300-500 | General documents, articles | Good balance (recommended default) |
| 500-1000 | Technical documentation | More context per chunk, less precise |
| 1000-2000 | Long-form content | Maximum context, may include irrelevant info |

### Tips

- Start with **500 tokens** (the default) and adjust based on search quality
- If search results feel too narrow, increase the size
- If results include too much irrelevant text, decrease the size
- The token count is approximate — actual chunks may vary slightly""",
    },
    {
        "slug": "kb-chunk-overlap",
        "title": "Chunk Overlap Parameter",
        "section_id": "kb-builder",
        "body": """## Chunk Overlap Parameter

**Overlap** is the number of tokens shared between consecutive chunks.

### Why Overlap?

Without overlap, information at chunk boundaries can be split across two chunks, making neither chunk fully useful. Overlap creates redundancy that preserves context continuity.

### Example

With chunk_size=500 and overlap=50:
- Chunk 1: tokens 1-500
- Chunk 2: tokens 451-950 (50 tokens shared with chunk 1)
- Chunk 3: tokens 901-1400

### Recommended Values

- **0**: No overlap — smallest storage, risk of split context
- **25-50**: Light overlap — good for well-structured documents
- **50-100**: Standard overlap — recommended for most use cases
- **100+**: Heavy overlap — for dense, interconnected content""",
    },
    {
        "slug": "kb-separators",
        "title": "Text Separators",
        "section_id": "kb-builder",
        "body": """## Text Separators

Separators define where the chunking algorithm prefers to split text.

### Default Separator Hierarchy

1. `\\n\\n` — Paragraph breaks (strongest preference)
2. `\\n` — Line breaks
3. ` ` — Word boundaries
4. `` — Individual characters (last resort)

The splitter tries each separator in order, using the first one that produces chunks within the target size. This preserves natural document structure.

### Custom Separators

For specialized content, you might add separators like:
- `---` for Markdown horizontal rules
- `## ` for Markdown headers
- `\\n\\n\\n` for heavily-spaced documents""",
    },
    {
        "slug": "kb-embedding-models",
        "title": "Embedding Models",
        "section_id": "kb-builder",
        "body": """## Embedding Models

An embedding model converts text into vectors. Different models have different strengths.

### Available Models (via Ollama)

- **nomic-embed-text** (1024d) — Excellent general-purpose model, good balance of quality and speed
- **mxbai-embed-large** (1024d) — High quality, slightly slower
- **all-minilm** (384d) — Fast and lightweight, good for large datasets
- **snowflake-arctic-embed** (1024d) — Strong multilingual support

### Choosing a Model

- For most use cases, **nomic-embed-text** is the recommended default
- If you need multilingual support, consider snowflake-arctic-embed
- For very large datasets where speed matters, use all-minilm
- All chunks in a knowledge base should use the **same model** for consistent search""",
    },
    {
        "slug": "kb-embedding-dimensions",
        "title": "Vector Dimensions",
        "section_id": "kb-builder",
        "body": """## Vector Dimensions

The **dimension count** of an embedding vector determines how much semantic information it can capture.

### Common Dimensions

- **384**: Compact — fast, less storage, slightly less accurate
- **768**: Standard — good balance for most tasks
- **1024**: Rich — more nuanced semantic capture (used by nomic-embed-text)
- **1536+**: Premium — maximum detail, highest storage cost

### Storage Impact

Each dimension is a 32-bit float (4 bytes). For a 1024-dimensional vector:
- Per vector: 4 KB
- 10,000 chunks: ~40 MB
- 100,000 chunks: ~400 MB

The pgvector IVFFlat index adds some overhead but enables fast approximate nearest-neighbor search.""",
    },
    {
        "slug": "kb-cosine-similarity",
        "title": "Cosine Similarity",
        "section_id": "kb-builder",
        "body": """## Cosine Similarity

**Cosine similarity** measures the angle between two vectors, determining how semantically similar two pieces of text are.

### The Formula

```
similarity = (A · B) / (||A|| × ||B||)
```

Where `A · B` is the dot product and `||A||` is the vector magnitude.

### Interpreting Scores

| Score | Meaning |
|-------|---------|
| 0.95-1.0 | Nearly identical meaning |
| 0.80-0.95 | Highly related |
| 0.60-0.80 | Somewhat related |
| 0.40-0.60 | Loosely related |
| < 0.40 | Unrelated |

### Why Cosine?

Cosine similarity is preferred over Euclidean distance for text because it measures **direction** (meaning) rather than **magnitude** (length). A short sentence and a long paragraph about the same topic will have similar cosine scores despite very different lengths.""",
    },
    {
        "slug": "kb-batch-size",
        "title": "Embedding Batch Size",
        "section_id": "kb-builder",
        "body": """## Embedding Batch Size

The batch size controls how many chunks are sent to the embedding model at once.

### How It Works

Instead of embedding chunks one at a time, the system groups them into batches (default: 10) for efficiency.

### Impact

- **Larger batches** (20-50): Faster overall, but uses more VRAM
- **Smaller batches** (5-10): Slower but more reliable, less memory usage
- **Default (10)**: Good balance for most GPU configurations

### Monitoring

During the build process, you can see progress updated after each batch completes. If builds fail mid-way, try reducing the batch size.""",
    },
    {
        "slug": "kb-scope-project-vs-global",
        "title": "Project vs Global Scope",
        "section_id": "kb-builder",
        "body": """## Project vs Global Scope

When building a knowledge base, you choose where it's accessible.

### Project Scope

- Chunks are linked to a specific project
- Only searchable within that project's workspace chat
- Deleted when the project is deleted
- Best for: project-specific documentation, code references

### Global Scope

- Chunks are not tied to any project (`project_id = NULL`)
- Available for search across all projects
- Persists even if projects are deleted
- Best for: general documentation, shared API references, company knowledge

### Recommendation

Use **project scope** for project-specific knowledge and **global scope** for reference material you want everywhere.""",
    },
    {
        "slug": "kb-indexing-pipeline",
        "title": "The Indexing Pipeline",
        "section_id": "kb-builder",
        "body": """## The Indexing Pipeline

Here's the complete flow from document to searchable knowledge:

### 1. Upload & Store
Files are uploaded to the server and assigned unique IDs for tracking.

### 2. Text Extraction
Each file is processed with the appropriate extractor (PDF parser, HTML stripper, OCR, or vision model).

### 3. Chunking
Extracted text is split into token-sized segments using recursive character splitting with configurable size and overlap.

### 4. Embedding Generation
Each chunk is sent to the embedding model (via Ollama) to produce a vector representation.

### 5. Vector Storage
Vectors are stored in PostgreSQL using the **pgvector** extension with an IVFFlat index optimized for cosine similarity.

### 6. Search
When you query, your question is embedded using the same model, then pgvector finds the closest vectors using approximate nearest-neighbor search.

This entire pipeline runs as a background task, with progress tracked via Redis and polling.""",
    },
]


async def seed():
    async with AsyncSessionLocal() as db:
        for topic in TOPICS:
            # Check if already exists
            result = await db.execute(
                text("SELECT id FROM help_topics WHERE slug = :slug"),
                {"slug": topic["slug"]},
            )
            existing = result.scalar_one_or_none()
            if existing:
                # Update content
                await db.execute(
                    text(
                        "UPDATE help_topics SET title = :title, body = :body, section_id = :section_id WHERE slug = :slug"
                    ),
                    topic,
                )
                print(f"Updated: {topic['slug']}")
            else:
                await db.execute(
                    text(
                        "INSERT INTO help_topics (id, slug, title, body, section_id) "
                        "VALUES (gen_random_uuid(), :slug, :title, :body, :section_id)"
                    ),
                    topic,
                )
                print(f"Created: {topic['slug']}")
        await db.commit()
    print(f"\nSeeded {len(TOPICS)} KB Builder help topics.")


if __name__ == "__main__":
    asyncio.run(seed())
