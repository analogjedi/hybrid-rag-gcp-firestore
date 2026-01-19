#!/usr/bin/env python3
"""
Direct Embedding Update Utility

Generates embeddings using Vertex AI directly and updates Firestore documents.
Bypasses Cloud Functions for simpler local execution.

Usage:
    python direct_embedding_update.py
"""

import os
from pathlib import Path
from datetime import datetime, timezone

# Use service account credentials
PROJECT_ROOT = Path(__file__).parent.parent
SERVICE_ACCOUNT_PATH = PROJECT_ROOT / "service-account.json"
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(SERVICE_ACCOUNT_PATH)

from google.cloud import firestore
from google.cloud.firestore_v1 import FieldFilter
from google.cloud.firestore_v1.vector import Vector
from vertexai.language_models import TextEmbeddingModel, TextEmbeddingInput
import vertexai

# Configuration
PROJECT_ID = "analog-fusion-knowledge-system"
LOCATION = "us-central1"
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 2048


def get_db():
    """Get Firestore client for the 'test' database."""
    return firestore.Client(project=PROJECT_ID, database="test")


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


def build_embedding_text(content: dict) -> str:
    """Build embedding text from all content fields except contentUpdatedAt."""
    if not content:
        return ""

    excluded_fields = {"contentUpdatedAt"}
    parts = []

    # Add summary first if it exists
    if "summary" in content and content["summary"]:
        parts.append(content["summary"])

    # Add all other fields
    for key, value in content.items():
        if key in excluded_fields or key == "summary":
            continue
        if value is None:
            continue

        field_name = key.replace("_", " ").title()

        if isinstance(value, list):
            if value:
                value_str = ", ".join(str(v) for v in value)
                parts.append(f"{field_name}: {value_str}")
        elif isinstance(value, str):
            if value.strip():
                parts.append(f"{field_name}: {value}")
        else:
            parts.append(f"{field_name}: {value}")

    return "\n".join(parts)


def generate_embedding(text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> list[float]:
    """Generate an embedding vector for the given text."""
    model = TextEmbeddingModel.from_pretrained(EMBEDDING_MODEL)
    inputs = [TextEmbeddingInput(text, task_type)]
    embeddings = model.get_embeddings(inputs, output_dimensionality=EMBEDDING_DIMENSIONS)
    return embeddings[0].values


def get_documents_needing_embeddings(collection_id: str) -> list[tuple[str, dict]]:
    """Get all documents in metadata_ready status."""
    db = get_db()
    docs_collection = f"{collection_id}_documents"

    docs_ref = db.collection(docs_collection)
    query = docs_ref.where(filter=FieldFilter("status", "==", "metadata_ready"))
    docs = query.stream()

    results = []
    for doc in docs:
        data = doc.to_dict()
        results.append((doc.id, data))

    return results


def update_document_embedding(collection_id: str, doc_id: str, embedding: list[float]) -> bool:
    """Update a document with its new embedding."""
    db = get_db()
    docs_collection = f"{collection_id}_documents"
    doc_ref = db.collection(docs_collection).document(doc_id)

    try:
        doc_ref.update({
            "contentEmbedding": {
                "vector": Vector(embedding),
                "embeddedAt": datetime.now(timezone.utc).isoformat(),
                "modelVersion": EMBEDDING_MODEL,
            },
            "status": "ready",
        })
        return True
    except Exception as e:
        print(f"  ERROR updating {docs_collection}/{doc_id}: {e}")
        return False


def process_collection(collection_id: str) -> dict:
    """Process all documents in a collection."""
    print(f"\nProcessing collection: {collection_id}")
    print("-" * 50)

    docs = get_documents_needing_embeddings(collection_id)

    if not docs:
        print("  No documents in 'metadata_ready' status")
        return {"total": 0, "processed": 0, "errors": 0}

    print(f"  Found {len(docs)} document(s) to process")

    processed = 0
    errors = 0

    for doc_id, data in docs:
        content = data.get("content", {})
        text = build_embedding_text(content)

        if not text:
            print(f"  SKIP: {doc_id} - no content")
            errors += 1
            continue

        print(f"\n  Processing: {doc_id}")
        print(f"    Text preview: {text[:100]}...")

        try:
            embedding = generate_embedding(text)
            print(f"    Generated embedding: {len(embedding)} dimensions")

            if update_document_embedding(collection_id, doc_id, embedding):
                print(f"    Updated successfully")
                processed += 1
            else:
                errors += 1
        except Exception as e:
            print(f"    ERROR: {e}")
            errors += 1

    return {"total": len(docs), "processed": processed, "errors": errors}


def main():
    print("=" * 60)
    print("Direct Embedding Update Utility")
    print("=" * 60)
    print(f"Project: {PROJECT_ID}")
    print(f"Model: {EMBEDDING_MODEL}")
    print(f"Dimensions: {EMBEDDING_DIMENSIONS}")
    print()

    # Initialize Vertex AI
    vertexai.init(project=PROJECT_ID, location=LOCATION)

    # Get all collections
    collection_ids = get_all_collection_ids()
    print(f"Found {len(collection_ids)} collection(s): {', '.join(collection_ids)}")

    if not collection_ids:
        print("No collections found!")
        return

    # Process each collection
    totals = {"total": 0, "processed": 0, "errors": 0}

    for collection_id in collection_ids:
        result = process_collection(collection_id)
        totals["total"] += result["total"]
        totals["processed"] += result["processed"]
        totals["errors"] += result["errors"]

    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Total documents: {totals['total']}")
    print(f"Processed: {totals['processed']}")
    print(f"Errors: {totals['errors']}")

    if totals["processed"] > 0:
        print()
        print("Embeddings generated with:")
        print(f"  Model: {EMBEDDING_MODEL}")
        print(f"  Dimensions: {EMBEDDING_DIMENSIONS}")
        print(f"  Task type: RETRIEVAL_DOCUMENT")


if __name__ == "__main__":
    main()
