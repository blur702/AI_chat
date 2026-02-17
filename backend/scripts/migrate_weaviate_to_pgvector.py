"""
Migrate Weaviate Drupal collections to pgvector (KB system).

Reads Weaviate LSM segment files, extracts JSON objects with their
text content and embeddings, and inserts them into the pgvector-backed
KB tables (kb_sources + kb_chunks).

Usage:
  docker run --rm \
    -v api_gateway_weaviate_data:/weaviate_data \
    -v D:/AICHAT/backend/scripts:/scripts \
    --network workstation_default \
    -e DATABASE_URL=postgresql://workstation_user:change_me_in_production@postgres:5432/workstation \
    python:3.12-slim \
    sh -c "pip install psycopg2-binary pgvector && python /scripts/migrate_weaviate_to_pgvector.py"
"""
import json
import os
import re
import struct
import sys
import uuid
from pathlib import Path
from datetime import datetime, timezone

# These will be installed in the container
import psycopg2
from pgvector.psycopg2 import register_vector


# --- Configuration ---
WEAVIATE_DATA_DIR = Path(os.environ.get("WEAVIATE_DATA_DIR", "/weaviate_data"))
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is required.", file=sys.stderr)
    sys.exit(1)

# Target project ID: we'll create a dedicated "drupal-api-docs" project
# or use an existing one
PROJECT_NAME = "Drupal API Documentation"
PROJECT_PATH = "drupal-api-docs"
USER_ID = os.environ.get("USER_ID")
if not USER_ID:
    print("ERROR: USER_ID environment variable is required (no hardcoded default).", file=sys.stderr)
    sys.exit(1)

DRUPAL_COLLECTIONS = {
    "drupalapi": {
        "source_name": "drupal-api-reference",
        "source_type": "text",
        "content_fields": ["deprecated"],  # main content in 'deprecated' field based on sample
        "description": "Drupal API reference (classes, interfaces, traits, functions)",
    },
    "drupalmoduledocs": {
        "source_name": "drupal-module-docs",
        "source_type": "markdown",
        "content_fields": ["content"],
        "description": "Drupal module documentation",
    },
    "drupaltwigtemplates": {
        "source_name": "drupal-twig-templates",
        "source_type": "text",
        "content_fields": ["content"],
        "description": "Drupal Twig template overrides and examples",
    },
}


def extract_json_objects(data: bytes) -> list[dict]:
    """Extract JSON objects from a Weaviate LSM segment file.

    Objects are stored as binary blobs with JSON-encoded property values.
    We scan for JSON object boundaries and parse them.
    """
    text = data.decode("utf-8", errors="replace")
    objects = []

    # Find all JSON objects that look like Weaviate property storage
    # They start with { and contain known field names
    i = 0
    while i < len(text):
        # Find potential JSON object start
        pos = text.find('{"', i)
        if pos == -1:
            break

        # Try to find matching closing brace
        depth = 0
        j = pos
        while j < len(text):
            if text[j] == '{':
                depth += 1
            elif text[j] == '}':
                depth -= 1
                if depth == 0:
                    try:
                        candidate = text[pos:j+1]
                        obj = json.loads(candidate)
                        # Only keep objects that look like Weaviate data
                        if isinstance(obj, dict) and len(obj) >= 2:
                            objects.append(obj)
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        pass
                    break
            j += 1
            # Safety: don't scan too far for a single object
            if j - pos > 100000:
                break

        i = max(pos + 1, j + 1) if j < len(text) else pos + 1

    return objects


def extract_vectors_from_segment(data: bytes, dimension: int = 1024) -> list[list[float]]:
    """Extract float32 vectors from binary data.

    Weaviate stores HNSW vectors as contiguous float32 arrays.
    We look for sequences of exactly `dimension` float32 values.
    """
    vectors = []
    float_size = 4
    vector_bytes = dimension * float_size

    # Scan for plausible vector data (float32 values typically between -5 and 5)
    i = 0
    while i <= len(data) - vector_bytes:
        try:
            vec = list(struct.unpack(f"<{dimension}f", data[i:i + vector_bytes]))
            # Validate: vectors should have reasonable magnitude
            magnitude = sum(v * v for v in vec) ** 0.5
            if 0.5 < magnitude < 50.0:  # Reasonable L2 norm for embeddings
                # Additional check: values should be in reasonable range
                max_val = max(abs(v) for v in vec)
                if max_val < 10.0:
                    vectors.append(vec)
                    i += vector_bytes
                    continue
        except struct.error:
            pass
        i += float_size  # Slide by one float

    return vectors


def process_collection(collection_path: Path) -> list[dict]:
    """Process a Weaviate collection directory and extract all objects with content."""
    all_objects = []

    for shard_dir in collection_path.iterdir():
        if not shard_dir.is_dir():
            continue

        objects_dir = shard_dir / "lsm" / "objects"
        if not objects_dir.exists():
            continue

        # Extract JSON objects from segment files
        for segment_file in sorted(objects_dir.glob("*.db")):
            data = segment_file.read_bytes()
            json_objects = extract_json_objects(data)
            all_objects.extend(json_objects)

        # Try to extract vectors from HNSW commitlog
        hnsw_dir = shard_dir / "main.hnsw.commitlog.d"
        if hnsw_dir.exists():
            for hnsw_file in sorted(hnsw_dir.glob("*.condensed")):
                # These contain the actual vectors but in a complex format
                pass  # We'll re-embed instead

    return all_objects


def build_content(obj: dict, content_fields: list[str]) -> str:
    """Build a text content string from a Weaviate object."""
    parts = []

    # Try all fields in the object, prioritizing content_fields
    for field in content_fields:
        if field in obj and obj[field]:
            val = str(obj[field]).strip()
            if val and val != "[]" and val != "{}":
                parts.append(val)

    # Also include other text fields that might have useful content
    for key, val in obj.items():
        if key in content_fields:
            continue
        if key in ("content_hash", "scraped_at", "last_modified"):
            continue
        if isinstance(val, str) and len(val) > 20:
            val = val.strip()
            if val and val != "[]" and val != "{}":
                parts.append(f"{key}: {val}")

    return "\n\n".join(parts)


def main():
    print(f"Weaviate data dir: {WEAVIATE_DATA_DIR}")
    print(f"Database URL: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else '(hidden)'}")

    # Connect to PostgreSQL
    conn = psycopg2.connect(DATABASE_URL)
    cur = None
    try:
        register_vector(conn)
        cur = conn.cursor()

        # Ensure pgvector extension
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
        conn.commit()

        # Find or create the project
        cur.execute("SELECT id FROM projects WHERE path = %s", (PROJECT_PATH,))
        row = cur.fetchone()
        if row:
            project_id = row[0]
            print(f"Using existing project: {project_id}")
        else:
            project_id = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO projects (id, user_id, name, path, type, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (project_id, USER_ID, PROJECT_NAME, PROJECT_PATH, "drupal", datetime.now(timezone.utc), datetime.now(timezone.utc)),
            )
            conn.commit()
            print(f"Created project: {project_id}")

        total_chunks_inserted = 0

        for collection_name, config in DRUPAL_COLLECTIONS.items():
            collection_path = WEAVIATE_DATA_DIR / collection_name
            if not collection_path.exists():
                print(f"\nSkipping {collection_name}: directory not found")
                continue

            print(f"\n{'='*60}")
            print(f"Processing: {collection_name}")
            print(f"  Description: {config['description']}")

            # Extract objects
            objects = process_collection(collection_path)
            print(f"  Extracted {len(objects)} JSON objects")

            if not objects:
                print("  No objects found, skipping")
                continue

            # Build content strings
            content_items = []
            for obj in objects:
                content = build_content(obj, config["content_fields"])
                if content and len(content) > 30:  # Skip tiny fragments
                    content_items.append(content)

            # Deduplicate
            seen = set()
            unique_items = []
            for item in content_items:
                key = item[:200]  # Dedup on first 200 chars
                if key not in seen:
                    seen.add(key)
                    unique_items.append(item)

            print(f"  Unique content items: {len(unique_items)}")

            if not unique_items:
                print("  No content items, skipping")
                continue

            # Check if source already exists
            cur.execute(
                "SELECT id FROM kb_sources WHERE project_id = %s AND source_path LIKE %s",
                (project_id, f"%{config['source_name']}%"),
            )
            existing = cur.fetchone()
            if existing:
                print(f"  Source already exists ({existing[0]}), skipping. Delete it first to re-import.")
                continue

            # Create KB source
            source_id = str(uuid.uuid4())
            cur.execute(
                """INSERT INTO kb_sources (id, project_id, source_type, source_path, status, chunk_count, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    source_id, project_id, config["source_type"],
                    f"weaviate-import/{config['source_name']}",
                    "pending_embeddings",  # Text is chunked but embeddings are generated later
                    len(unique_items),
                    datetime.now(timezone.utc), datetime.now(timezone.utc),
                ),
            )

            # Insert chunks (without embeddings — we'll generate them via the worker)
            for idx, content in enumerate(unique_items):
                chunk_id = str(uuid.uuid4())
                metadata = json.dumps({
                    "source": "weaviate_migration",
                    "collection": collection_name,
                    "chunk_length": len(content),
                })
                cur.execute(
                    """INSERT INTO kb_chunks (id, source_id, project_id, content, chunk_index, metadata, created_at, updated_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        chunk_id, source_id, project_id, content, idx,
                        metadata,
                        datetime.now(timezone.utc), datetime.now(timezone.utc),
                    ),
                )

            conn.commit()
            total_chunks_inserted += len(unique_items)
            print(f"  Inserted {len(unique_items)} chunks (source_id: {source_id})")
            print("  Status: 'pending_embeddings' - run generate_embeddings_task to embed them")

        print(f"\n{'='*60}")
        print(f"MIGRATION COMPLETE")
        print(f"  Project: {PROJECT_NAME} ({project_id})")
        print(f"  Total chunks inserted: {total_chunks_inserted}")
        print(f"\nNext steps:")
        print(f"  1. Trigger embedding generation via the ARQ worker")
        print(f"  2. Or call POST /api/kb/search to search (after embeddings)")
    finally:
        if cur:
            cur.close()
        conn.close()


if __name__ == "__main__":
    main()
