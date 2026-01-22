"""
Cloud Functions Entry Point

This module re-exports all Cloud Functions for Firebase deployment.
Firebase discovers decorated functions from this entry point.

Functions:
1. process_document - Gemini multimodal PDF analysis (extracts tables/figures/images)
2. process_pending_documents - Batch document processing
3. generate_document_embedding - Single document embedding
4. generate_embeddings_for_ready_docs - Batch embedding generation
5. generate_element_embeddings_for_document - Element embeddings for a single document
6. generate_all_element_embeddings - Batch element embedding generation
7. classify_and_search - Agentic query classification + multi-collection search (includes elements)
8. generate_grounded_answer - Grounded LLM response with citations (element-aware)
9. get_all_collection_stats - Dashboard statistics
10. backfill_embeddings - Batch embedding backfill
11. create_vector_index - Vector index management
"""

# Document processing
from document_processing import (
    process_document,
    process_pending_documents,
)

# Embedding generation
from embeddings import (
    generate_document_embedding,
    generate_embeddings_for_ready_docs,
    generate_element_embeddings_for_document,
    generate_all_element_embeddings,
)

# Agentic search
from search import classify_and_search

# Grounded answers
from grounding import generate_grounded_answer

# Administrative
from admin import (
    backfill_embeddings,
    create_vector_index,
    get_all_collection_stats,
)

# Re-export all Cloud Functions for Firebase discovery
__all__ = [
    # Document processing
    "process_document",
    "process_pending_documents",
    # Embeddings
    "generate_document_embedding",
    "generate_embeddings_for_ready_docs",
    "generate_element_embeddings_for_document",
    "generate_all_element_embeddings",
    # Search
    "classify_and_search",
    # Grounding
    "generate_grounded_answer",
    # Admin
    "get_all_collection_stats",
    "backfill_embeddings",
    "create_vector_index",
]
