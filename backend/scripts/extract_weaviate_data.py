"""
Extract data from Weaviate LSM storage files directly.

This script reads the LSM segment .db files from each Weaviate collection's
objects directory and extracts text content, bypassing the need for a running
Weaviate instance.
"""
import struct
import json
import sys
import os
from pathlib import Path


def extract_strings_from_segment(filepath: Path) -> list[str]:
    """Extract object data from a Weaviate LSM segment .db file.

    Weaviate stores objects as length-prefixed binary blobs in LSM segments.
    The text properties are embedded as UTF-8 strings within these blobs.
    We extract readable text content heuristically.
    """
    results = []
    try:
        data = filepath.read_bytes()
    except Exception as e:
        print(f"  Warning: could not read {filepath}: {e}", file=sys.stderr)
        return results

    # Search for JSON-like content or readable text blocks
    # Weaviate stores properties in a binary format, but text fields
    # are stored as UTF-8 strings with length prefixes
    text = data.decode("utf-8", errors="replace")

    # Look for substantial text blocks (content fields)
    # Filter out binary garbage
    chunks = []
    current_chunk = []
    readable_count = 0

    for char in text:
        if char.isprintable() or char in '\n\r\t':
            current_chunk.append(char)
            readable_count += 1
        else:
            if readable_count > 50:  # Only keep substantial text blocks
                chunk_text = ''.join(current_chunk).strip()
                if chunk_text and len(chunk_text) > 50:
                    chunks.append(chunk_text)
            current_chunk = []
            readable_count = 0

    # Don't forget the last chunk
    if readable_count > 50:
        chunk_text = ''.join(current_chunk).strip()
        if chunk_text and len(chunk_text) > 50:
            chunks.append(chunk_text)

    return chunks


def scan_collection(collection_path: Path) -> dict:
    """Scan a Weaviate collection directory for data."""
    info = {
        "name": collection_path.name,
        "shards": [],
    }

    # Each collection has shard directories (like liSRR3Q2s5PS)
    for shard_dir in collection_path.iterdir():
        if not shard_dir.is_dir():
            continue

        shard_info = {"id": shard_dir.name, "object_count": 0, "sample_content": []}

        # Check indexcount
        indexcount_file = shard_dir / "indexcount"
        if indexcount_file.exists():
            try:
                count_bytes = indexcount_file.read_bytes()
                if len(count_bytes) >= 8:
                    count = struct.unpack("<Q", count_bytes[:8])[0]
                    shard_info["object_count"] = count
                elif len(count_bytes) >= 4:
                    count = struct.unpack("<I", count_bytes[:4])[0]
                    shard_info["object_count"] = count
            except Exception:
                pass

        # Check proplengths for property names
        proplengths_file = shard_dir / "proplengths"
        if proplengths_file.exists():
            try:
                pl_text = proplengths_file.read_text(errors="replace")
                shard_info["proplengths"] = pl_text.strip()
            except Exception:
                pass

        # Look at LSM objects
        objects_dir = shard_dir / "lsm" / "objects"
        if objects_dir.exists():
            for segment_file in sorted(objects_dir.glob("*.db")):
                chunks = extract_strings_from_segment(segment_file)
                for chunk in chunks[:3]:  # First 3 samples per segment
                    shard_info["sample_content"].append(chunk[:500])

        info["shards"].append(shard_info)

    return info


def main():
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/data")

    if not data_dir.exists():
        print(f"Data directory {data_dir} does not exist", file=sys.stderr)
        sys.exit(1)

    # Find all collection directories (skip raft, migration files, etc.)
    skip = {"raft", "raft.bak", "__pycache__"}
    collections = []

    for item in sorted(data_dir.iterdir()):
        if item.is_dir() and item.name not in skip:
            collections.append(item)

    print(f"Found {len(collections)} collections in {data_dir}\n")

    drupal_collections = []

    for coll_path in collections:
        info = scan_collection(coll_path)
        total_objects = sum(s["object_count"] for s in info["shards"])
        print(f"Collection: {info['name']}")
        print(f"  Shards: {len(info['shards'])}")
        print(f"  Total objects: {total_objects}")

        for shard in info["shards"]:
            if shard.get("proplengths"):
                print(f"  Properties: {shard['proplengths'][:200]}")
            if shard["sample_content"]:
                print(f"  Sample content ({len(shard['sample_content'])} chunks):")
                for i, sample in enumerate(shard["sample_content"][:2]):
                    print(f"    [{i}] {sample[:200]}...")

        print()

        if "drupal" in info["name"].lower():
            drupal_collections.append(info)

    # Summary of Drupal collections
    if drupal_collections:
        print("=" * 60)
        print("DRUPAL COLLECTIONS SUMMARY:")
        for dc in drupal_collections:
            total = sum(s["object_count"] for s in dc["shards"])
            print(f"  {dc['name']}: {total} objects")


if __name__ == "__main__":
    main()
