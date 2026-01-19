#!/usr/bin/env python3
"""
Regenerate Embeddings Utility

Triggers the Cloud Function to generate embeddings for all documents
in 'metadata_ready' status across all collections.

Usage:
    python regenerate_embeddings.py                    # Process all collections
    python regenerate_embeddings.py --collection X    # Only process collection X
    python regenerate_embeddings.py --limit 10        # Limit docs per collection
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
from google.auth import default
from google.auth.transport.requests import Request
import requests
import json


# Configuration
PROJECT_ID = "analog-fusion-knowledge-system"
REGION = "us-central1"
FUNCTION_NAME = "generate_embeddings_for_ready_docs"


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


def get_pending_count(collection_id: str) -> int:
    """Get count of documents in metadata_ready status."""
    db = get_db()
    docs_collection = f"{collection_id}_documents"

    docs_ref = db.collection(docs_collection)
    query = docs_ref.where("status", "==", "metadata_ready")
    docs = list(query.stream())

    return len(docs)


def call_cloud_function(collection_id: str, limit: int = 50) -> dict:
    """
    Call the generate_embeddings_for_ready_docs Cloud Function.

    Uses Firebase callable function protocol.
    """
    # Get credentials
    credentials, project = default()
    credentials.refresh(Request())

    # Build the URL for the callable function
    url = f"https://{REGION}-{PROJECT_ID}.cloudfunctions.net/{FUNCTION_NAME}"

    # Prepare the request
    headers = {
        "Authorization": f"Bearer {credentials.token}",
        "Content-Type": "application/json",
    }

    # Firebase callable function expects data wrapped in "data" field
    payload = {
        "data": {
            "collectionId": collection_id,
            "limit": limit,
        }
    }

    print(f"  Calling Cloud Function for {collection_id} (limit={limit})...")

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=300)

        if response.status_code == 200:
            result = response.json()
            # Firebase callable returns result in "result" field
            return result.get("result", result)
        else:
            return {
                "error": f"HTTP {response.status_code}: {response.text}",
                "processed": 0,
                "errors": 0,
            }

    except requests.exceptions.Timeout:
        return {
            "error": "Request timed out (function may still be processing)",
            "processed": 0,
            "errors": 0,
        }
    except Exception as e:
        return {
            "error": str(e),
            "processed": 0,
            "errors": 0,
        }


def process_collection(collection_id: str, limit: int = 50) -> dict:
    """Process a single collection."""
    print(f"\nCollection: {collection_id}")
    print("-" * 50)

    # Check pending count
    pending = get_pending_count(collection_id)
    print(f"  Documents in 'metadata_ready' status: {pending}")

    if pending == 0:
        print(f"  No documents to process")
        return {"processed": 0, "errors": 0, "pending": 0}

    # Call the cloud function
    result = call_cloud_function(collection_id, limit)

    if "error" in result:
        print(f"  ERROR: {result['error']}")
        return {"processed": 0, "errors": 1, "pending": pending}

    processed = result.get("processed", 0)
    errors = result.get("errors", 0)

    print(f"  Processed: {processed}")
    print(f"  Errors: {errors}")

    if result.get("details"):
        for detail in result["details"][:5]:  # Show first 5
            status = "OK" if detail.get("success") else "FAIL"
            print(f"    [{status}] {detail.get('documentId')}")
        if len(result["details"]) > 5:
            print(f"    ... and {len(result['details']) - 5} more")

    return {"processed": processed, "errors": errors, "pending": pending}


def main():
    parser = argparse.ArgumentParser(
        description="Regenerate embeddings for documents in metadata_ready status"
    )
    parser.add_argument(
        "--collection",
        type=str,
        help="Only process a specific collection (by ID)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="Maximum documents to process per collection (default: 50)",
    )

    args = parser.parse_args()

    print("=" * 60)
    print("Embedding Regeneration Utility")
    print("=" * 60)
    print(f"Project: {PROJECT_ID}")
    print(f"Function: {FUNCTION_NAME}")
    print(f"Limit per collection: {args.limit}")
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
    totals = {"processed": 0, "errors": 0, "pending": 0}

    for collection_id in collection_ids:
        result = process_collection(collection_id, args.limit)
        totals["processed"] += result["processed"]
        totals["errors"] += result["errors"]
        totals["pending"] += result["pending"]

    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Total pending before: {totals['pending']}")
    print(f"Total processed: {totals['processed']}")
    print(f"Total errors: {totals['errors']}")

    remaining = totals["pending"] - totals["processed"]
    if remaining > 0:
        print()
        print(f"Remaining documents: {remaining}")
        print("Run again to process more documents.")


if __name__ == "__main__":
    main()
