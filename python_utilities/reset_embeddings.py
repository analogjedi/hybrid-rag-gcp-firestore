#!/usr/bin/env python3
"""
Reset Embeddings Utility

Clears contentEmbedding fields and resets status to 'metadata_ready'
so that new embeddings can be generated with the updated model.

Usage:
    python reset_embeddings.py                    # Dry run (show what would be changed)
    python reset_embeddings.py --execute          # Actually perform the reset
    python reset_embeddings.py --collection X     # Only reset collection X
"""

import argparse
import os
import sys
from pathlib import Path

# Add parent directory to find service account
PROJECT_ROOT = Path(__file__).parent.parent
SERVICE_ACCOUNT_PATH = PROJECT_ROOT / "service-account.json"

# Set credentials environment variable
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(SERVICE_ACCOUNT_PATH)

from google.cloud import firestore
from google.cloud.firestore_v1 import FieldFilter


def get_db():
    """Get Firestore client for the 'test' database."""
    return firestore.Client(database="test")


def get_all_collection_ids() -> list[str]:
    """Get all collection IDs from the schemas."""
    db = get_db()
    schemas_ref = db.collection("_system/config/schemas")
    schemas = schemas_ref.stream()

    collection_ids = []
    for schema_doc in schemas:
        schema = schema_doc.to_dict()
        collection_id = schema.get("collection", {}).get("id")
        if collection_id:
            collection_ids.append(collection_id)

    return collection_ids


def get_documents_with_embeddings(collection_id: str) -> list[tuple[str, dict]]:
    """Get all documents that have contentEmbedding in a collection."""
    db = get_db()
    docs_collection = f"{collection_id}_documents"

    # Query for documents that have contentEmbedding field
    docs_ref = db.collection(docs_collection)
    docs = docs_ref.stream()

    results = []
    for doc in docs:
        data = doc.to_dict()
        if data.get("contentEmbedding"):
            results.append((doc.id, data))

    return results


def reset_document_embedding(collection_id: str, doc_id: str, dry_run: bool = True) -> bool:
    """
    Reset a single document's embedding.

    - Deletes contentEmbedding field
    - Sets status to 'metadata_ready'
    """
    db = get_db()
    docs_collection = f"{collection_id}_documents"
    doc_ref = db.collection(docs_collection).document(doc_id)

    if dry_run:
        print(f"  [DRY RUN] Would reset: {docs_collection}/{doc_id}")
        return True

    try:
        doc_ref.update({
            "contentEmbedding": firestore.DELETE_FIELD,
            "status": "metadata_ready",
        })
        print(f"  Reset: {docs_collection}/{doc_id}")
        return True
    except Exception as e:
        print(f"  ERROR resetting {docs_collection}/{doc_id}: {e}")
        return False


def reset_collection_embeddings(collection_id: str, dry_run: bool = True) -> dict:
    """Reset all embeddings in a collection."""
    print(f"\nProcessing collection: {collection_id}")
    print("-" * 50)

    docs = get_documents_with_embeddings(collection_id)

    if not docs:
        print(f"  No documents with embeddings found")
        return {"total": 0, "reset": 0, "errors": 0}

    print(f"  Found {len(docs)} document(s) with embeddings")

    reset_count = 0
    error_count = 0

    for doc_id, data in docs:
        embedding_info = data.get("contentEmbedding", {})
        model = embedding_info.get("modelVersion", "unknown")
        embedded_at = embedding_info.get("embeddedAt", "unknown")

        print(f"\n  Document: {doc_id}")
        print(f"    Model: {model}")
        print(f"    Embedded: {embedded_at}")

        if reset_document_embedding(collection_id, doc_id, dry_run):
            reset_count += 1
        else:
            error_count += 1

    return {"total": len(docs), "reset": reset_count, "errors": error_count}


def main():
    parser = argparse.ArgumentParser(
        description="Reset embeddings to regenerate with new model"
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually perform the reset (default is dry run)",
    )
    parser.add_argument(
        "--collection",
        type=str,
        help="Only reset a specific collection (by ID)",
    )

    args = parser.parse_args()
    dry_run = not args.execute

    print("=" * 60)
    print("Embedding Reset Utility")
    print("=" * 60)
    print(f"Project: analog-fusion-knowledge-system")
    print(f"Database: test")
    print(f"Mode: {'DRY RUN' if dry_run else 'EXECUTE'}")
    print()

    if dry_run:
        print("NOTE: This is a dry run. Use --execute to actually reset embeddings.")
        print()

    # Get collections to process
    if args.collection:
        collection_ids = [args.collection]
        print(f"Processing single collection: {args.collection}")
    else:
        collection_ids = get_all_collection_ids()
        print(f"Found {len(collection_ids)} collection(s): {', '.join(collection_ids)}")

    if not collection_ids:
        print("No collections found!")
        return

    # Process each collection
    totals = {"total": 0, "reset": 0, "errors": 0}

    for collection_id in collection_ids:
        result = reset_collection_embeddings(collection_id, dry_run)
        totals["total"] += result["total"]
        totals["reset"] += result["reset"]
        totals["errors"] += result["errors"]

    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Total documents with embeddings: {totals['total']}")
    print(f"Documents reset: {totals['reset']}")
    print(f"Errors: {totals['errors']}")

    if dry_run and totals["total"] > 0:
        print()
        print("To actually reset these embeddings, run:")
        print("  python reset_embeddings.py --execute")

    if not dry_run and totals["reset"] > 0:
        print()
        print("Next steps:")
        print("  1. Create new vector indexes with dimension=2048")
        print("  2. Call generate_embeddings_for_ready_docs for each collection")


if __name__ == "__main__":
    main()
