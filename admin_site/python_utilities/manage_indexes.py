#!/usr/bin/env python3
"""
Firestore Vector Index Management Utilities

Usage:
    # List all indexes
    python manage_indexes.py list

    # Create vector index for a collection
    python manage_indexes.py create <collection_name>

    # Create indexes for all document collections
    python manage_indexes.py create-all

Note: Uses your gcloud auth credentials (run 'gcloud auth application-default login' first)
"""

import argparse
import sys
from google.cloud import firestore_admin_v1

# Configuration
PROJECT_ID = "analog-fusion-knowledge-system"
DATABASE_ID = "test"
EMBEDDING_DIMENSION = 768
EMBEDDING_FIELD = "contentEmbedding.vector"


def get_client():
    """Get Firestore Admin client."""
    return firestore_admin_v1.FirestoreAdminClient()


def list_indexes():
    """List all composite indexes."""
    client = get_client()
    parent = f"projects/{PROJECT_ID}/databases/{DATABASE_ID}/collectionGroups/-"

    print(f"Listing indexes for {PROJECT_ID}/{DATABASE_ID}...\n")

    try:
        indexes = client.list_indexes(parent=parent)
        found = False
        for index in indexes:
            found = True
            collection = index.name.split("/collectionGroups/")[1].split("/indexes/")[0]
            state = firestore_admin_v1.Index.State(index.state).name

            fields = []
            for field in index.fields:
                if field.vector_config:
                    fields.append(f"{field.field_path} (vector:{field.vector_config.dimension})")
                elif field.order:
                    fields.append(f"{field.field_path} ({firestore_admin_v1.Index.IndexField.Order(field.order).name})")
                elif field.array_config:
                    fields.append(f"{field.field_path} (array)")

            print(f"Collection: {collection}")
            print(f"  State: {state}")
            print(f"  Fields: {', '.join(fields)}")
            print()

        if not found:
            print("No indexes found.")
    except Exception as e:
        print(f"Error listing indexes: {e}")


def create_vector_index(collection_name: str):
    """Create a vector index for a collection."""
    client = get_client()

    # Collection name should end with _documents
    if not collection_name.endswith("_documents"):
        collection_name = f"{collection_name}_documents"

    parent = f"projects/{PROJECT_ID}/databases/{DATABASE_ID}/collectionGroups/{collection_name}"

    index = firestore_admin_v1.Index(
        query_scope=firestore_admin_v1.Index.QueryScope.COLLECTION,
        fields=[
            firestore_admin_v1.Index.IndexField(
                field_path=EMBEDDING_FIELD,
                vector_config=firestore_admin_v1.Index.IndexField.VectorConfig(
                    dimension=EMBEDDING_DIMENSION,
                    flat=firestore_admin_v1.Index.IndexField.VectorConfig.FlatIndex(),
                ),
            ),
        ],
    )

    print(f"Creating vector index for {collection_name}...")

    try:
        operation = client.create_index(parent=parent, index=index)
        print(f"Index creation started: {operation.operation.name}")
        print("This may take a few minutes to complete.")
        print("Run 'python manage_indexes.py list' to check status.")
    except Exception as e:
        if "already exists" in str(e).lower():
            print(f"Index already exists for {collection_name}")
        else:
            print(f"Error creating index: {e}")


def create_all_indexes():
    """Create vector indexes for all known document collections."""
    collections = [
        "human_resources_all",
        "ic_process_engineering",
        "ic_design_engineering",
        "products_and_datasheets",
        "etq_specifications",
        "functional_safety",
    ]

    print(f"Creating vector indexes for {len(collections)} collections...\n")

    for collection in collections:
        create_vector_index(collection)
        print()


def reset_documents_to_pending(collection_name: str):
    """Reset all error documents in a collection to pending status."""
    from google.cloud import firestore

    if not collection_name.endswith("_documents"):
        collection_name = f"{collection_name}_documents"

    db = firestore.Client(project=PROJECT_ID, database=DATABASE_ID)
    docs = db.collection(collection_name).where("status", "==", "error").get()

    count = 0
    for doc in docs:
        doc.reference.update({"status": "pending", "error": firestore.DELETE_FIELD})
        count += 1

    print(f"Reset {count} documents to 'pending' status in {collection_name}")


def check_documents(collection_name: str):
    """Check document statuses in a collection."""
    from google.cloud import firestore

    if not collection_name.endswith("_documents"):
        collection_name = f"{collection_name}_documents"

    db = firestore.Client(project=PROJECT_ID, database=DATABASE_ID)
    docs = db.collection(collection_name).get()

    print(f"Documents in {collection_name}:\n")

    for doc in docs:
        data = doc.to_dict()
        print(f"  {doc.id}")
        print(f"    File: {data.get('fileName')}")
        print(f"    Status: {data.get('status')}")
        if data.get('error'):
            print(f"    Error: {data.get('error')[:100]}...")
        embedding = data.get('contentEmbedding', {})
        if embedding.get('vector'):
            print(f"    Embedding: {len(embedding['vector'])} dimensions")
        print()


def main():
    parser = argparse.ArgumentParser(description="Firestore Vector Index Management")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # List command
    subparsers.add_parser("list", help="List all indexes")

    # Create command
    create_parser = subparsers.add_parser("create", help="Create vector index for a collection")
    create_parser.add_argument("collection", help="Collection name (with or without _documents suffix)")

    # Create all command
    subparsers.add_parser("create-all", help="Create indexes for all known collections")

    # Reset command
    reset_parser = subparsers.add_parser("reset", help="Reset error documents to pending")
    reset_parser.add_argument("collection", help="Collection name")

    # Check command
    check_parser = subparsers.add_parser("check", help="Check document statuses")
    check_parser.add_argument("collection", help="Collection name")

    args = parser.parse_args()

    if args.command == "list":
        list_indexes()
    elif args.command == "create":
        create_vector_index(args.collection)
    elif args.command == "create-all":
        create_all_indexes()
    elif args.command == "reset":
        reset_documents_to_pending(args.collection)
    elif args.command == "check":
        check_documents(args.collection)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
