"""
Vector Similarity Search Cloud Function

This module implements semantic search across document embeddings using
Firestore's find_nearest() vector search capability.

Example Use Case:
    A semiconductor engineer searching for "FinFET process with stress engineering"
    across thousands of IC design documents and process specifications.

Usage:
    Call from client:
    const results = await searchDocuments({ query: "metal fill optimization", limit: 20 });
"""

from __future__ import annotations

import os
import sys
from typing import Any

from firebase_admin import initialize_app, firestore
from firebase_functions import https_fn, options
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector


# Initialize Firebase Admin SDK (safe to call multiple times)
try:
    initialize_app()
except ValueError:
    pass  # Already initialized

db = firestore.client()


@https_fn.on_call(
    timeout_sec=30,
    memory=options.MemoryOption.MB_512,
    secrets=["GEMINI_API_KEY"],
)
def vector_search(request: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Search documents by natural language query using vector similarity.

    This function:
    1. Validates the request and user authentication
    2. Generates an embedding for the search query using Gemini
    3. Performs vector similarity search against stored document embeddings
    4. Returns ranked results with relevance scores

    Args:
        request: Firebase callable request containing:
            - collectionPath (str): Path to the collection to search
            - query (str): Natural language search query (min 3 chars)
            - limit (int, optional): Maximum results to return (default 20, max 50)
            - threshold (float, optional): Cosine distance threshold 0.0-1.0 (default 0.5)

    Returns:
        dict containing:
            - success (bool): Whether the search completed successfully
            - results (list): Array of matching documents with metadata
            - query (str): The original search query
            - totalSearched (int): Number of documents searched

    Raises:
        https_fn.HttpsError: For authentication, validation, or internal errors.

    Example:
        Request:
        {
            "collectionPath": "documents",
            "query": "FinFET process with stress engineering",
            "limit": 20,
            "threshold": 0.5
        }

        Response:
        {
            "success": true,
            "results": [
                {
                    "documentId": "doc123",
                    "distance": 0.187,
                    "relevanceScore": 53,
                    "summary": "7nm FinFET process flow with SiGe stress",
                    "category": "process_flow"
                }
            ],
            "query": "FinFET process with stress engineering",
            "totalSearched": 150
        }
    """
    print("DEBUG search: ===== FUNCTION STARTED =====", file=sys.stderr)

    try:
        # 1. Validate authentication
        if not request.auth:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
                message="Must be authenticated to search"
            )

        uid = request.auth.uid

        # 2. Extract and validate parameters
        collection_path = request.data.get('collectionPath', 'documents')
        query = request.data.get('query', '').strip()
        limit = min(request.data.get('limit', 20), 50)  # Cap at 50
        threshold = request.data.get('threshold', 0.5)

        # Validate threshold range
        threshold = max(0.0, min(1.0, float(threshold)))

        print(
            f"DEBUG search: uid={uid}, collection={collection_path}, "
            f"query='{query}', limit={limit}, threshold={threshold}",
            file=sys.stderr
        )

        if not query or len(query) < 3:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message="Query must be at least 3 characters"
            )

        # 3. Generate query embedding
        query_embedding = _generate_query_embedding(query)
        if query_embedding is None:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                message="Failed to generate query embedding"
            )

        print(f"DEBUG search: Generated embedding with {len(query_embedding)} dimensions", file=sys.stderr)

        # 4. Execute vector search
        print("DEBUG search: Executing vector search...", file=sys.stderr)
        collection_ref = db.collection(collection_path)

        # Find nearest vectors using cosine distance
        # distance_result_field tells Firestore to include the distance in results
        vector_query = collection_ref.find_nearest(
            vector_field="contentEmbedding.vector",
            query_vector=Vector(query_embedding),
            distance_measure=DistanceMeasure.COSINE,
            limit=limit,
            distance_result_field="vector_distance",
        )

        # 5. Process results
        results = []
        docs = list(vector_query.stream())
        print(f"DEBUG search: Found {len(docs)} matching documents", file=sys.stderr)

        for doc in docs:
            data = doc.to_dict()
            content = data.get('content', {})

            # Get distance from the vector_distance field we requested
            distance = data.get('vector_distance', 0) or 0

            # Calculate relevance score (0-100)
            # Uses 0.4 as baseline - anything at or above 0.4 distance is 0% relevant
            relevance_score = _calculate_relevance_score(distance)

            print(
                f"DEBUG search: doc={doc.id}, distance={distance:.4f}, "
                f"relevance={relevance_score}",
                file=sys.stderr
            )

            # Skip results that are too dissimilar
            if distance > threshold:
                print(
                    f"DEBUG search: Skipping {doc.id} - "
                    f"distance {distance:.4f} > threshold {threshold}",
                    file=sys.stderr
                )
                continue

            results.append({
                'documentId': doc.id,
                'distance': round(distance, 4),
                'relevanceScore': relevance_score,
                'summary': content.get('summary', ''),
                'category': content.get('category', ''),
                'title': content.get('title', ''),
            })

        print(f"DEBUG search: Returning {len(results)} results", file=sys.stderr)

        return {
            'success': True,
            'results': results,
            'query': query,
            'totalSearched': len(docs),
        }

    except https_fn.HttpsError:
        raise
    except Exception as e:
        print(f"DEBUG search: EXCEPTION: {type(e).__name__}: {e}", file=sys.stderr)
        import traceback
        print(f"DEBUG search: TRACEBACK: {traceback.format_exc()}", file=sys.stderr)
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Search failed: {str(e)}"
        )


def _generate_query_embedding(query: str) -> list[float] | None:
    """
    Generate a 768-dimensional embedding for the search query.

    Args:
        query: The search query text.

    Returns:
        List of 768 floats representing the embedding, or None if generation fails.
    """
    from google import genai
    from google.genai import types

    gemini_api_key = os.environ.get('GEMINI_API_KEY')
    if not gemini_api_key:
        print("DEBUG search: GEMINI_API_KEY not configured", file=sys.stderr)
        return None

    client = genai.Client(api_key=gemini_api_key)

    print("DEBUG search: Generating query embedding...", file=sys.stderr)
    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=query,
        config=types.EmbedContentConfig(output_dimensionality=768),
    )

    return response.embeddings[0].values


def _calculate_relevance_score(distance: float) -> int:
    """
    Convert cosine distance to a relevance percentage (0-100).

    Uses 0.4 as the baseline distance where relevance becomes 0%.
    This provides meaningful scores for semantic similarity:
    - Distance 0.0 → 100% (identical)
    - Distance 0.2 → 50% (good match)
    - Distance 0.4+ → 0% (poor match)

    Args:
        distance: Cosine distance from find_nearest() (0.0 to ~2.0)

    Returns:
        Integer relevance score from 0 to 100.
    """
    BASELINE_DISTANCE = 0.4
    relevance = (1 - distance / BASELINE_DISTANCE) * 100
    return max(0, min(100, int(relevance)))
