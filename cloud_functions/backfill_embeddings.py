"""
Batch Embedding Backfill Cloud Function

This module implements a batch function to generate embeddings for existing
documents that don't yet have embeddings (e.g., after deploying the trigger
to an existing collection).

Example Use Case:
    A semiconductor company has 5,000 existing design documents uploaded before
    the embedding trigger was deployed. This function backfills embeddings for
    all documents in batches.

Usage:
    Call from client or admin console:
    await backfillEmbeddings({ collectionPath: "documents", limit: 50 });
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from typing import Any

from firebase_admin import initialize_app, firestore
from firebase_functions import https_fn, options
from google.cloud.firestore_v1.vector import Vector


# Initialize Firebase Admin SDK (safe to call multiple times)
try:
    initialize_app()
except ValueError:
    pass  # Already initialized

db = firestore.client()


@https_fn.on_call(
    timeout_sec=540,  # 9 minutes for batch processing
    memory=options.MemoryOption.GB_1,
    secrets=["GEMINI_API_KEY"],
)
def backfill_embeddings(request: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Batch function to generate embeddings for existing documents.

    This function:
    1. Finds all documents with content but no contentEmbedding
    2. Generates embeddings in batches
    3. Returns count of processed documents and remaining count

    The function is idempotent - running it multiple times is safe.
    It only processes documents that need embeddings.

    Args:
        request: Firebase callable request containing:
            - collectionPath (str): Path to the collection to process
            - limit (int, optional): Maximum documents to process (default 50)

    Returns:
        dict containing:
            - success (bool): Whether the operation completed
            - processed (int): Number of embeddings generated
            - remaining (int): Estimated remaining documents to process
            - collectionPath (str): The collection that was processed
            - errors (list): Any documents that failed to process

    Raises:
        https_fn.HttpsError: For authentication or configuration errors.

    Example:
        Request:
        {
            "collectionPath": "documents",
            "limit": 100
        }

        Response:
        {
            "success": true,
            "processed": 87,
            "remaining": 213,
            "collectionPath": "documents",
            "errors": ["doc456"]
        }
    """
    print("DEBUG backfill: ===== FUNCTION STARTED =====", file=sys.stderr)

    try:
        # 1. Validate authentication
        if not request.auth:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
                message="Must be authenticated"
            )

        uid = request.auth.uid

        # 2. Extract parameters
        collection_path = request.data.get('collectionPath', 'documents')
        limit = min(request.data.get('limit', 50), 200)  # Cap at 200 per call

        print(f"DEBUG backfill: uid={uid}, collection={collection_path}, limit={limit}", file=sys.stderr)

        # 3. Initialize Gemini client
        from google import genai
        from google.genai import types

        gemini_api_key = os.environ.get('GEMINI_API_KEY')
        if not gemini_api_key:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                message="GEMINI_API_KEY not configured"
            )

        client = genai.Client(api_key=gemini_api_key)

        # 4. Find documents needing embeddings
        collection_ref = db.collection(collection_path)
        all_docs = list(collection_ref.stream())

        to_process = []
        for doc in all_docs:
            data = doc.to_dict()
            content = data.get('content')
            content_embedding = data.get('contentEmbedding')

            if not content:
                continue  # No content to embed

            # Check if embedding is missing
            if not content_embedding:
                to_process.append((doc, data, content))
                continue

            # Check if embedding is outdated
            content_updated_at = content.get('contentUpdatedAt', '')
            embedded_at = content_embedding.get('embeddedAt', '')
            if content_updated_at > embedded_at:
                to_process.append((doc, data, content))

        total_needing = len(to_process)
        remaining = max(0, total_needing - limit)
        print(f"DEBUG backfill: Found {total_needing} documents needing embeddings", file=sys.stderr)

        # 5. Process documents up to limit
        processed = 0
        errors = []

        for doc, data, content in to_process[:limit]:
            try:
                # Extract text to embed
                summary = content.get("summary", "")
                details = content.get("details", "")

                if not summary and not details:
                    continue

                text_to_embed = f"{summary}\n\n{details}".strip()

                # Generate embedding
                response = client.models.embed_content(
                    model="gemini-embedding-001",
                    contents=text_to_embed,
                    config=types.EmbedContentConfig(output_dimensionality=768),
                )

                embedding_values = response.embeddings[0].values
                embedded_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

                # Update document
                doc.reference.update({
                    "contentEmbedding": {
                        "vector": Vector(embedding_values),
                        "embeddedAt": embedded_at,
                        "modelVersion": "gemini-embedding-001",
                    }
                })

                processed += 1
                print(f"DEBUG backfill: Processed {doc.id} ({processed}/{limit})", file=sys.stderr)

            except Exception as e:
                print(f"DEBUG backfill: Error processing {doc.id}: {e}", file=sys.stderr)
                errors.append(doc.id)
                continue

        print(f"DEBUG backfill: Complete. Processed {processed}, remaining {remaining}", file=sys.stderr)

        return {
            'success': True,
            'processed': processed,
            'remaining': remaining,
            'collectionPath': collection_path,
            'errors': errors,
        }

    except https_fn.HttpsError:
        raise
    except Exception as e:
        print(f"DEBUG backfill: EXCEPTION: {type(e).__name__}: {e}", file=sys.stderr)
        import traceback
        print(f"DEBUG backfill: TRACEBACK: {traceback.format_exc()}", file=sys.stderr)
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Backfill failed: {str(e)}"
        )


@https_fn.on_call(
    timeout_sec=60,
    memory=options.MemoryOption.MB_256,
)
def get_embedding_stats(request: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Get statistics about embedding coverage for a collection.

    Useful for monitoring backfill progress and embedding health.

    Args:
        request: Firebase callable request containing:
            - collectionPath (str): Path to the collection to analyze

    Returns:
        dict containing:
            - totalDocuments (int): Total documents in collection
            - withEmbedding (int): Documents with embeddings
            - withoutEmbedding (int): Documents missing embeddings
            - outdatedEmbedding (int): Documents with stale embeddings
            - coveragePercent (float): Percentage with up-to-date embeddings
    """
    if not request.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Must be authenticated"
        )

    collection_path = request.data.get('collectionPath', 'documents')
    collection_ref = db.collection(collection_path)

    total = 0
    with_embedding = 0
    without_embedding = 0
    outdated = 0

    for doc in collection_ref.stream():
        total += 1
        data = doc.to_dict()

        content = data.get('content')
        embedding = data.get('contentEmbedding')

        if not content:
            continue

        if not embedding:
            without_embedding += 1
            continue

        # Check if outdated
        content_updated_at = content.get('contentUpdatedAt', '')
        embedded_at = embedding.get('embeddedAt', '')

        if content_updated_at > embedded_at:
            outdated += 1
        else:
            with_embedding += 1

    coverage = (with_embedding / total * 100) if total > 0 else 0

    return {
        'totalDocuments': total,
        'withEmbedding': with_embedding,
        'withoutEmbedding': without_embedding,
        'outdatedEmbedding': outdated,
        'coveragePercent': round(coverage, 1),
    }
