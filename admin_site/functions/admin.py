"""
Administrative Functions Module

Cloud Functions for system administration:
- get_all_collection_stats: Dashboard statistics
- backfill_embeddings: Batch backfill embeddings
- create_vector_index: Vector index management
"""

from datetime import datetime
from typing import Any

from firebase_functions import https_fn, options
from google.cloud.firestore_v1.vector import Vector

from common import (
    DATABASE_ID,
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    PROJECT_ID,
    get_db,
)
from embeddings import build_embedding_text, generate_embedding


# =============================================================================
# ENTRY POINTS
# =============================================================================


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=30,
)
def get_all_collection_stats(req: https_fn.CallableRequest) -> dict[str, Any]:
    """Get statistics for all collections."""
    db = get_db()

    # Get all schemas
    schemas_ref = db.collection("_system/config/schemas")
    schemas_docs = schemas_ref.get()

    stats = []
    for schema_doc in schemas_docs:
        schema = schema_doc.to_dict()
        collection_id = schema.get("collection", {}).get("id")

        if not collection_id:
            continue

        # Documents are in {collection_id}_documents
        docs_ref = db.collection(f"{collection_id}_documents")
        all_docs = docs_ref.get()

        total = 0
        with_embedding = 0
        processing = 0
        errored = 0

        for doc in all_docs:
            total += 1
            doc_data = doc.to_dict()
            status = doc_data.get("status")

            if status == "ready" and doc_data.get("contentEmbedding", {}).get("vector"):
                with_embedding += 1
            elif status == "error":
                errored += 1
            elif status in ("pending", "analyzing", "metadata_ready", "embedding"):
                processing += 1

        stats.append(
            {
                "collectionId": collection_id,
                "totalDocuments": total,
                "withEmbedding": with_embedding,
                "withoutEmbedding": total - with_embedding - processing - errored,
                "processing": processing,
                "errored": errored,
                "coveragePercent": (
                    round((with_embedding / total) * 100) if total > 0 else 0
                ),
            }
        )

    return {"stats": stats}


@https_fn.on_call(
    memory=options.MemoryOption.GB_1,
    timeout_sec=300,
)
def backfill_embeddings(req: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Backfill embeddings for documents that have metadata but no embedding.

    Input:
    - collectionId: The collection to backfill (required)
    - limit: Max documents to process (default 50)

    Returns:
    - processed: Number of documents processed
    - errors: Number of errors
    """
    collection_id = req.data.get("collectionId")
    limit = req.data.get("limit", 50)

    if not collection_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="collectionId is required",
        )

    db = get_db()
    docs_ref = db.collection(f"{collection_id}_documents")

    # Find documents with metadata_ready status
    query = docs_ref.where("status", "==", "metadata_ready").limit(limit)
    docs = query.get()

    processed = 0
    errors = 0

    for doc in docs:
        try:
            doc_data = doc.to_dict()
            content = doc_data.get("content", {})
            embedding_text = build_embedding_text(content)

            if not embedding_text:
                continue

            # Generate embedding
            vector = generate_embedding(embedding_text)

            # Update document
            doc.reference.update(
                {
                    "contentEmbedding": {
                        "vector": Vector(vector),
                        "embeddedAt": datetime.now().isoformat() + "Z",
                        "modelVersion": EMBEDDING_MODEL,
                    },
                    "status": "ready",
                }
            )

            processed += 1

        except Exception as e:
            print(f"Error processing {doc.id}: {e}")
            errors += 1

    return {"processed": processed, "errors": errors}


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=60,
)
def create_vector_index(req: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Create a Firestore vector index for a collection.

    Input:
    - collectionId: The collection ID (without _documents suffix)

    Returns:
    - success: Whether the index creation was initiated
    - message: Status message
    - operationName: The long-running operation name (if successful)
    """
    from google.cloud import firestore_admin_v1

    collection_id = req.data.get("collectionId")

    if not collection_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="collectionId is required",
        )

    # Documents collection name
    documents_collection = f"{collection_id}_documents"

    # Build the parent path
    parent = f"projects/{PROJECT_ID}/databases/{DATABASE_ID}/collectionGroups/{documents_collection}"

    # Create the index definition
    index = firestore_admin_v1.Index(
        query_scope=firestore_admin_v1.Index.QueryScope.COLLECTION,
        fields=[
            firestore_admin_v1.Index.IndexField(
                field_path="contentEmbedding.vector",
                vector_config=firestore_admin_v1.Index.IndexField.VectorConfig(
                    dimension=EMBEDDING_DIMENSIONS,
                    flat=firestore_admin_v1.Index.IndexField.VectorConfig.FlatIndex(),
                ),
            ),
        ],
    )

    print(f"Creating vector index for {documents_collection}...")

    try:
        client = firestore_admin_v1.FirestoreAdminClient()
        operation = client.create_index(parent=parent, index=index)

        print(f"Index creation started: {operation.operation.name}")

        return {
            "success": True,
            "message": f"Vector index creation started for {documents_collection}",
            "operationName": operation.operation.name,
        }

    except Exception as e:
        error_str = str(e).lower()
        if "already exists" in error_str:
            print(f"Index already exists for {documents_collection}")
            return {
                "success": True,
                "message": f"Vector index already exists for {documents_collection}",
                "operationName": None,
            }
        else:
            print(f"Error creating index: {e}")
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INTERNAL,
                message=f"Failed to create index: {str(e)}",
            )
