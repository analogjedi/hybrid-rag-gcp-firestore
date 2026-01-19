#!/usr/bin/env python3
"""
Firestore Inspector Utility

Inspects the Firestore database to see what collections and documents exist.
Uses the service account from the parent directory.
"""

import json
import os
import sys
from pathlib import Path

# Add parent directory to find service account
PROJECT_ROOT = Path(__file__).parent.parent
SERVICE_ACCOUNT_PATH = PROJECT_ROOT / "service-account.json"

# Set credentials environment variable
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(SERVICE_ACCOUNT_PATH)

from google.cloud import firestore


def get_db():
    """Get Firestore client for the 'test' database."""
    return firestore.Client(database="test")


def list_root_collections():
    """List all root-level collections."""
    db = get_db()
    collections = db.collections()
    return [col.id for col in collections]


def list_documents(collection_path: str, limit: int = 10):
    """List documents in a collection."""
    db = get_db()
    docs = db.collection(collection_path).limit(limit).stream()
    return [(doc.id, doc.to_dict()) for doc in docs]


def get_document(doc_path: str):
    """Get a single document by path."""
    db = get_db()
    doc = db.document(doc_path).get()
    if doc.exists:
        return doc.to_dict()
    return None


def explore_collection(collection_path: str, depth: int = 0, max_depth: int = 3):
    """Recursively explore a collection and its subcollections."""
    if depth > max_depth:
        return

    indent = "  " * depth
    db = get_db()

    # Get documents
    docs = list(db.collection(collection_path).limit(5).stream())
    print(f"{indent}Collection: {collection_path} ({len(docs)} docs shown)")

    for doc in docs:
        print(f"{indent}  - {doc.id}")
        data = doc.to_dict()

        # Show a few key fields
        if data:
            keys = list(data.keys())[:5]
            for key in keys:
                value = data[key]
                if isinstance(value, dict):
                    print(f"{indent}      {key}: {{...}}")
                elif isinstance(value, list):
                    print(f"{indent}      {key}: [{len(value)} items]")
                elif isinstance(value, str) and len(value) > 50:
                    print(f"{indent}      {key}: {value[:50]}...")
                else:
                    print(f"{indent}      {key}: {value}")

        # Check for subcollections
        subcollections = list(doc.reference.collections())
        for subcol in subcollections:
            explore_collection(f"{collection_path}/{doc.id}/{subcol.id}", depth + 1, max_depth)


def main():
    print("=" * 60)
    print("Firestore Database Inspector")
    print(f"Project: analog-fusion-knowledge-system")
    print(f"Database: test")
    print("=" * 60)
    print()

    # List root collections
    print("Root Collections:")
    print("-" * 40)
    root_cols = list_root_collections()

    if not root_cols:
        print("  (no collections found)")
    else:
        for col in root_cols:
            print(f"  - {col}")

    print()

    # Explore each root collection
    print("Collection Details:")
    print("-" * 40)
    for col in root_cols:
        explore_collection(col)
        print()

    # Specifically check for _system/config/schemas
    print("Checking _system/config/schemas path:")
    print("-" * 40)
    schemas_path = "_system/config/schemas"
    try:
        schemas = list_documents(schemas_path)
        if schemas:
            print(f"  Found {len(schemas)} schema(s):")
            for doc_id, data in schemas:
                print(f"    - {doc_id}")
                if data and 'collection' in data:
                    print(f"        display_name: {data['collection'].get('display_name', 'N/A')}")
        else:
            print("  No schemas found at this path")
    except Exception as e:
        print(f"  Error accessing schemas: {e}")


if __name__ == "__main__":
    main()
