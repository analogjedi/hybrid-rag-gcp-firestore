"""
Firestore Vector Search Python Client

A Python client library for interacting with Firestore vector embeddings
and similarity search Cloud Functions.

Example:
    >>> from client_python import VectorSearchClient
    >>>
    >>> client = VectorSearchClient(
    ...     credentials_path="service-account.json",
    ...     project_id="my-project"
    ... )
    >>>
    >>> results = client.search("FinFET process with stress engineering")
    >>> for r in results.results:
    ...     print(f"{r.relevance_score}% - {r.summary}")

Streamlit Example:
    >>> import streamlit as st
    >>> from client_python import VectorSearchClient, StreamlitSearchUI
    >>>
    >>> client = VectorSearchClient.from_streamlit_secrets()
    >>> ui = StreamlitSearchUI(client)
    >>> ui.render()
"""

from .types import (
    # Document types
    DocumentContent,
    ContentEmbedding,
    EmbeddableDocument,
    # Search types
    SearchRequest,
    SearchResponse,
    SearchResult,
    # Backfill types
    BackfillRequest,
    BackfillResponse,
    EmbeddingStats,
    # Conversion helpers
    search_result_from_dict,
    search_response_from_dict,
    backfill_response_from_dict,
    embedding_stats_from_dict,
)

from .search_client import (
    VectorSearchClient,
    StreamlitSearchUI,
    calculate_relevance,
    format_relevance,
    batch_backfill,
)

__all__ = [
    # Document types
    "DocumentContent",
    "ContentEmbedding",
    "EmbeddableDocument",
    # Search types
    "SearchRequest",
    "SearchResponse",
    "SearchResult",
    # Backfill types
    "BackfillRequest",
    "BackfillResponse",
    "EmbeddingStats",
    # Client
    "VectorSearchClient",
    "StreamlitSearchUI",
    # Utilities
    "calculate_relevance",
    "format_relevance",
    "batch_backfill",
    # Conversion helpers
    "search_result_from_dict",
    "search_response_from_dict",
    "backfill_response_from_dict",
    "embedding_stats_from_dict",
]

__version__ = "1.0.0"
