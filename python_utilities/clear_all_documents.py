#!/usr/bin/env python3
"""
Clear All Documents Utility

Deletes all documents from Firestore collections AND their files from Cloud Storage.
Keeps collection schemas intact.

Usage:
    python clear_all_documents.py           # Dry run (shows what would be deleted)
    python clear_all_documents.py --execute # Actually delete
"""

import argparse
import os
from pathlib import Path

# Use service account credentials
PROJECT_ROOT = Path(__file__).parent.parent
SERVICE_ACCOUNT_PATH = PROJECT_ROOT / "service-account.json"
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(SERVICE_ACCOUNT_PATH)

from google.cloud import firestore, storage

# Configuration
PROJECT_ID = "analog-fusion-knowledge-system"
DATABASE_ID = "test"
STORAGE_BUCKET = "analog-fusion-knowledge-system-documents"


def get_db():
    """Get Firestore client for the 'test' database."""
    return firestore.Client(project=PROJECT_ID, database=DATABASE_ID)


def get_storage_client():
    """Get Cloud Storage client."""
    return storage.Client(project=PROJECT_ID)


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


def extract_storage_path(gs_uri: str) -> str | None:
    """Extract the file path from a gs:// URI."""
    if not gs_uri or not gs_uri.startswith("gs://"):
        return None

    # gs://bucket-name/path/to/file -> path/to/file
    parts = gs_uri.split("/", 3)
    if len(parts) >= 4:
        return parts[3]
    return None


def clear_collection(collection_id: str, execute: bool = False) -> dict:
    """Clear all documents from a collection and their storage files."""
    db = get_db()
    storage_client = get_storage_client()
    bucket = storage_client.bucket(STORAGE_BUCKET)

    docs_collection = f"{collection_id}_documents"
    docs_ref = db.collection(docs_collection)
    docs = list(docs_ref.stream())

    results = {
        "collection": collection_id,
        "documents_found": len(docs),
        "documents_deleted": 0,
        "files_deleted": 0,
        "errors": []
    }

    for doc in docs:
        doc_data = doc.to_dict()
        storage_path = doc_data.get("storagePath")
        file_path = extract_storage_path(storage_path) if storage_path else None

        print(f"  - {doc.id}")
        if file_path:
            print(f"    Storage: {file_path}")

        if execute:
            # Delete storage file first
            if file_path:
                try:
                    blob = bucket.blob(file_path)
                    blob.delete()
                    results["files_deleted"] += 1
                    print(f"    [DELETED] Storage file")
                except Exception as e:
                    error_msg = f"Storage delete failed for {file_path}: {e}"
                    results["errors"].append(error_msg)
                    print(f"    [ERROR] {e}")

            # Delete Firestore document
            try:
                doc.reference.delete()
                results["documents_deleted"] += 1
                print(f"    [DELETED] Firestore document")
            except Exception as e:
                error_msg = f"Firestore delete failed for {doc.id}: {e}"
                results["errors"].append(error_msg)
                print(f"    [ERROR] {e}")

    return results


def main():
    parser = argparse.ArgumentParser(description="Clear all documents and storage files")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually perform the deletion (default is dry run)"
    )
    parser.add_argument(
        "--collection",
        type=str,
        help="Only clear a specific collection (default: all collections)"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Clear All Documents Utility")
    print("=" * 60)
    print(f"Project: {PROJECT_ID}")
    print(f"Database: {DATABASE_ID}")
    print(f"Storage Bucket: {STORAGE_BUCKET}")
    print(f"Mode: {'EXECUTE (will delete!)' if args.execute else 'DRY RUN (preview only)'}")
    print()

    if args.collection:
        collection_ids = [args.collection]
    else:
        collection_ids = get_all_collection_ids()

    print(f"Found {len(collection_ids)} collection(s): {', '.join(collection_ids)}")
    print()

    if not collection_ids:
        print("No collections found!")
        return

    all_results = []

    for collection_id in collection_ids:
        print(f"\nCollection: {collection_id}")
        print("-" * 50)

        results = clear_collection(collection_id, execute=args.execute)
        all_results.append(results)

    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)

    total_docs = sum(r["documents_found"] for r in all_results)
    total_deleted = sum(r["documents_deleted"] for r in all_results)
    total_files = sum(r["files_deleted"] for r in all_results)
    total_errors = sum(len(r["errors"]) for r in all_results)

    print(f"Documents found: {total_docs}")

    if args.execute:
        print(f"Documents deleted: {total_deleted}")
        print(f"Storage files deleted: {total_files}")
        print(f"Errors: {total_errors}")

        if total_errors > 0:
            print("\nErrors encountered:")
            for r in all_results:
                for error in r["errors"]:
                    print(f"  - {error}")
    else:
        print()
        print("This was a DRY RUN. No changes were made.")
        print("Run with --execute to actually delete the documents.")


if __name__ == "__main__":
    main()
