"""
Hybrid Search Module

Cloud Functions and utilities for agentic query classification and hybrid search:
- classify_and_search: Agentic classification + multi-collection search
- classify_query: Gemini 3 query classification
- calculate_relevance_score: DOT_PRODUCT → percentage conversion
- search_collection: Hybrid keyword + vector search
- search_collection_debug: Debug mode multi-permutation search
"""

import json
import os
import time
from typing import Any

from firebase_functions import https_fn, options
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector

from common import get_db
from embeddings import generate_embedding
from reranking import rerank_results


# =============================================================================
# ENTRY POINTS
# =============================================================================


@https_fn.on_call(
    memory=options.MemoryOption.GB_1,
    timeout_sec=120,
    secrets=["GEMINI_API_KEY"],
)
def classify_and_search(req: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Agentic search: classify query and search relevant collection(s).

    Input:
    - query: The user's search query
    - limit: Max results per collection (default 10)
    - threshold: Min similarity threshold for DOT_PRODUCT (default 0.3)
    - model: Gemini model to use for classification (default: gemini-2.5-pro-preview-05-06)
    - thinkingLevel: Thinking budget - "LOW" or "HIGH" (default: LOW)
    - debugMode: Run multi-permutation search with score breakdown (default: False)

    Returns:
    - results: Merged search results
    - classification: The classification decision
    - searchMetadata: Performance info
    """
    start_time = time.time()

    query = req.data.get("query", "")
    limit = req.data.get("limit", 10)
    # DOT_PRODUCT threshold: minimum similarity to include (0.3 = moderately similar)
    threshold = req.data.get("threshold", 0.3)
    # Model selection and thinking level
    model_name = req.data.get("model", "gemini-2.5-pro")
    thinking_level = req.data.get("thinkingLevel", "LOW")
    # Debug mode for multi-permutation search
    debug_mode = req.data.get("debugMode", False)

    if not query:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Query is required",
        )

    print(f"[DEBUG] Using model: {model_name}, thinking: {thinking_level}")

    db = get_db()

    # Get all collection schemas
    schemas_ref = db.collection("_system/config/schemas")
    schemas_docs = schemas_ref.get()

    if not schemas_docs:
        return {"results": [], "classification": None, "searchMetadata": {}}

    schemas = [doc.to_dict() for doc in schemas_docs]

    # Classify the query and extract search terms
    classification = classify_query(query, schemas, model_name, thinking_level)

    # Extract search terms from classification
    exact_terms = classification.get("exact_match_terms", [])
    semantic_terms = classification.get("semantic_search_terms", [])

    # Search collections based on classification
    results = []
    collections_searched = []

    # Always search primary collection (documents)
    primary_results = search_collection(
        db,
        classification["primary_collection"],
        query,
        limit,
        threshold,
        exact_terms=exact_terms,
        semantic_terms=semantic_terms,
        debug_mode=debug_mode,
    )
    results.extend(primary_results)
    collections_searched.append(classification["primary_collection"])

    # Always search elements in parallel (element-level search)
    element_limit = limit // 2  # Half of limit for elements
    primary_element_results = search_elements(
        db,
        classification["primary_collection"],
        query,
        element_limit,
        threshold,
    )
    results.extend(primary_element_results)

    # Search secondary collections if confidence is high enough
    if classification.get("secondary_confidence", 0) > 0.3:
        for secondary_id in classification.get("secondary_collections", []):
            secondary_limit = limit // 2  # Fewer results from secondary
            secondary_results = search_collection(
                db,
                secondary_id,
                query,
                secondary_limit,
                threshold,
                exact_terms=exact_terms,
                semantic_terms=semantic_terms,
                debug_mode=debug_mode,
            )
            results.extend(secondary_results)
            collections_searched.append(secondary_id)

            # Also search elements in secondary collections
            secondary_element_results = search_elements(
                db,
                secondary_id,
                query,
                secondary_limit // 2,
                threshold,
            )
            results.extend(secondary_element_results)

    # Sort results by weighted score
    results.sort(key=lambda x: x.get("weightedScore", 0), reverse=True)

    # Rerank using AI if enabled and we have results
    enable_rerank = req.data.get("enableRerank", True)
    rerank_applied = False

    if results and enable_rerank and len(results) > 1:
        results = rerank_results(query, classification, results, limit)
        rerank_applied = True
    else:
        # Just limit results if no reranking
        results = results[:limit]

    search_time_ms = int((time.time() - start_time) * 1000)

    return {
        "results": results,
        "classification": classification,
        "searchMetadata": {
            "collectionsSearched": collections_searched,
            "totalCandidates": len(results),
            "searchTimeMs": search_time_ms,
            "rerankApplied": rerank_applied,
        },
    }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def classify_query(
    query: str,
    schemas: list[dict[str, Any]],
    model_name: str = "gemini-2.5-pro",
    thinking_level: str = "LOW",
) -> dict[str, Any]:
    """Classify a query to determine which collection(s) to search and extract search terms."""
    from google import genai
    from google.genai import types

    # Get API key from environment (injected by Firebase secrets)
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")

    # Create client with Vertex AI mode
    client = genai.Client(
        vertexai=True,
        api_key=api_key,
    )

    # Build collection descriptions
    collections_info = []
    for schema in schemas:
        coll = schema.get("collection", {})
        hints = schema.get("classifier_hints", {})

        # Manual keywords (defined in schema)
        manual_keywords = hints.get("keywords", [])

        # Document keywords with frequencies (auto-aggregated from documents)
        doc_keywords = hints.get("document_keywords", {})
        # Sort by frequency (descending) and format as "keyword(count)"
        doc_keyword_list = sorted(
            doc_keywords.items(),
            key=lambda x: x[1],
            reverse=True
        )
        doc_keywords_str = ", ".join(
            f"{kw}({count})" for kw, count in doc_keyword_list
        ) if doc_keyword_list else "none yet"

        collections_info.append(
            f"""- {coll.get('id')} ("{coll.get('display_name')}")
  Description: {coll.get('description', '')}
  Manual keywords: {', '.join(manual_keywords[:10]) if manual_keywords else 'none'}
  Document keywords (with frequency): {doc_keywords_str}
  Example queries: {'; '.join(hints.get('example_queries', [])[:3])}"""
        )

    prompt = f"""You are a query router for an enterprise document search system.

Available document collections:

{chr(10).join(collections_info)}

User query: "{query}"

Analyze the query and determine:
1. Which collection(s) would most likely contain relevant documents
2. What terms should be matched exactly vs semantically

Return a JSON object with:
- primary_collection: The collection ID most likely to have relevant results
- primary_confidence: Confidence score 0.0 to 1.0
- secondary_collections: Array of other potentially relevant collection IDs (can be empty)
- secondary_confidence: Average confidence for secondary collections (0.0 if none)
- reasoning: Brief explanation of your routing decision
- search_strategy: One of "primary_only", "primary_then_secondary", or "parallel"
- exact_match_terms: Array of terms that should be matched exactly (part numbers, model numbers, specific identifiers like "AHV85003", "ACS37630", SKUs, product codes). These are typically alphanumeric codes that have no semantic meaning.
- semantic_search_terms: Array of terms for semantic/conceptual matching (descriptions, concepts like "SiC driver", "current sensor", "gate driver")

Use "primary_only" if very confident (>0.8) the query belongs to one collection.
Use "primary_then_secondary" if moderately confident but want fallback.
Use "parallel" if the query spans multiple domains equally.

Examples of term extraction:
- "AHV85003 SiC driver" -> exact_match_terms: ["AHV85003"], semantic_search_terms: ["SiC driver", "gate driver"]
- "current sensor hall effect" -> exact_match_terms: [], semantic_search_terms: ["current sensor", "hall effect"]
- "find datasheet for ACS37630" -> exact_match_terms: ["ACS37630"], semantic_search_terms: ["datasheet"]"""

    # Configure generation - thinking_config only supported by Gemini 3 models
    if "gemini-3" in model_name:
        config = types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=8192,
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(
                thinking_level=thinking_level,  # "LOW" or "HIGH"
            ),
        )
        print(f"[DEBUG] classify_query: model={model_name}, thinking_level={thinking_level}")
    else:
        # Gemini 2.5 and earlier don't support thinking_config
        config = types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=8192,
            response_mime_type="application/json",
        )
        print(f"[DEBUG] classify_query: model={model_name} (no thinking support)")

    # Create content
    contents = [
        types.Content(
            role="user",
            parts=[types.Part(text=prompt)],
        )
    ]

    response = client.models.generate_content(
        model=model_name,
        contents=contents,
        config=config,
    )

    response_text = response.text.strip()
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        response_text = "\n".join(lines[1:-1])

    return json.loads(response_text)


def calculate_relevance_score(similarity: float | None) -> float:
    """
    Convert DOT_PRODUCT similarity to a relevance score with better differentiation.

    Old formula: (similarity + 1) / 2  → compressed 0.3-0.7 into 65%-85%
    New formula: Scale practical range (0.25-0.75) to 0-100%

    This gives much better differentiation:
    - 0.75+ similarity → 100% (excellent match)
    - 0.50 similarity → 50% (moderate match)
    - 0.25 similarity → 0% (poor match)
    """
    if similarity is None:
        return 0.0

    # Scale from practical range [0.25, 0.75] to [0, 1]
    # Clamp to ensure we stay in 0-1 range
    return max(0.0, min(1.0, (similarity - 0.25) / 0.5))


def search_collection(
    db,
    collection_id: str,
    query: str,
    limit: int,
    threshold: float,
    exact_terms: list[str] | None = None,
    semantic_terms: list[str] | None = None,
    debug_mode: bool = False,
) -> list[dict[str, Any]]:
    """
    Search a single collection using hybrid keyword + vector similarity.

    Hybrid search flow:
    1. If exact_terms provided: Find documents with matching keywords (boosted score)
    2. Perform semantic vector search using semantic_terms or full query
    3. Merge results, avoiding duplicates, with exact matches ranked higher

    Debug mode:
    - Runs multiple search permutations (exact terms, each semantic term, full query)
    - Returns scoreBreakdown with individual scores for each permutation
    """
    if debug_mode:
        return search_collection_debug(
            db, collection_id, query, limit, threshold, exact_terms, semantic_terms
        )

    # Standard (fast) search mode
    docs_ref = db.collection(f"{collection_id}_documents")
    results = []
    seen_doc_ids = set()

    # Phase 1: Exact keyword matches (if exact_terms provided)
    if exact_terms:
        print(f"[DEBUG] Searching for exact terms: {exact_terms}")
        for term in exact_terms:
            # Search for term in keywords array (case-insensitive would need preprocessing)
            # Firestore array_contains is case-sensitive, so we check for exact match
            keyword_query = docs_ref.where(
                "content.keywords", "array_contains", term
            ).limit(limit)

            for doc in keyword_query.get():
                if doc.id in seen_doc_ids:
                    continue

                doc_data = doc.to_dict()
                content = doc_data.get("content", {})

                # Exact keyword match gets high boosted score
                results.append(
                    {
                        "documentId": doc.id,
                        "collectionId": collection_id,
                        "rawSimilarity": None,  # No vector similarity for keyword match
                        "weightedScore": 0.95,  # High score for exact match
                        "matchType": "exact",
                        "summary": content.get("summary", ""),
                        "keywords": content.get("keywords", []),
                        "fileName": doc_data.get("fileName", ""),
                        "storagePath": doc_data.get("storagePath", ""),
                        # Include chapter/figure metadata for granular citations
                        "chapters": content.get("chapters", []),
                        "figures": content.get("figures", []),
                        "tables": content.get("tables", []),
                    }
                )
                seen_doc_ids.add(doc.id)
                print(f"[DEBUG] Exact match: {doc.id} for term '{term}'")

    # Phase 2: Semantic vector search
    # Use semantic_terms if available, otherwise use the full query
    search_text = " ".join(semantic_terms) if semantic_terms else query
    print(f"[DEBUG] Semantic search text: '{search_text}'")

    query_vector = generate_embedding(search_text, task_type="RETRIEVAL_QUERY")

    vector_query = docs_ref.find_nearest(
        vector_field="contentEmbedding.vector",
        query_vector=Vector(query_vector),
        distance_measure=DistanceMeasure.DOT_PRODUCT,
        limit=limit,
        distance_result_field="vector_distance",
    )

    for doc in vector_query.get():
        # Skip if already found in exact match phase
        if doc.id in seen_doc_ids:
            print(f"[DEBUG] Skipping {doc.id} - already found as exact match")
            continue

        doc_data = doc.to_dict()
        content = doc_data.get("content", {})

        # DOT_PRODUCT: higher = more similar (range -1 to 1 for normalized vectors)
        similarity = doc_data.get("vector_distance")

        print(f"[DEBUG] Semantic match: {doc.id}, similarity={similarity}, fileName={doc_data.get('fileName', 'N/A')}")

        # Apply threshold filtering for semantic results
        if similarity is not None and similarity < threshold:
            print(f"[DEBUG] Filtered out {doc.id} - below threshold {threshold}")
            continue

        results.append(
            {
                "documentId": doc.id,
                "collectionId": collection_id,
                "rawSimilarity": similarity,
                "weightedScore": calculate_relevance_score(similarity),
                "matchType": "semantic",
                "summary": content.get("summary", ""),
                "keywords": content.get("keywords", []),
                "fileName": doc_data.get("fileName", ""),
                "storagePath": doc_data.get("storagePath", ""),
                # Include chapter/figure metadata for granular citations
                "chapters": content.get("chapters", []),
                "figures": content.get("figures", []),
                "tables": content.get("tables", []),
            }
        )
        seen_doc_ids.add(doc.id)

    # Sort by weightedScore descending
    results.sort(key=lambda x: x.get("weightedScore", 0), reverse=True)

    print(f"[DEBUG] Collection {collection_id}: Found {len(results)} results (exact: {sum(1 for r in results if r.get('matchType') == 'exact')}, semantic: {sum(1 for r in results if r.get('matchType') == 'semantic')})")
    return results


def search_elements(
    db,
    collection_id: str,
    query: str,
    limit: int,
    threshold: float,
) -> list[dict[str, Any]]:
    """
    Search element subcollections using collection group query.

    Returns element results with matchType="element" and element-specific fields.
    """
    # Generate query embedding
    query_vector = generate_embedding(query, task_type="RETRIEVAL_QUERY")

    # Collection group query for elements
    # Note: Requires a collection group index on "elements" with collectionId and contentEmbedding.vector
    elements_query = (
        db.collection_group("elements")
        .where("collectionId", "==", collection_id)
        .where("status", "==", "ready")
    )

    # Perform vector search on the collection group
    vector_query = elements_query.find_nearest(
        vector_field="contentEmbedding.vector",
        query_vector=Vector(query_vector),
        distance_measure=DistanceMeasure.DOT_PRODUCT,
        limit=limit,
        distance_result_field="vector_distance",
    )

    results = []
    for doc in vector_query.get():
        doc_data = doc.to_dict()
        element = doc_data.get("element", {})
        similarity = doc_data.get("vector_distance")

        # Apply threshold filtering
        if similarity is not None and similarity < threshold:
            continue

        results.append(
            {
                "documentId": doc_data.get("parentDocumentId", ""),
                "collectionId": collection_id,
                "rawSimilarity": similarity,
                "weightedScore": calculate_relevance_score(similarity),
                "matchType": "element",
                "summary": element.get("description", ""),
                "keywords": [],  # Elements don't have keywords
                "fileName": doc_data.get("parentFileName", ""),
                "storagePath": doc_data.get("parentStoragePath", ""),
                # Element-specific fields
                "elementId": doc.id,
                "elementType": doc_data.get("elementType", ""),
                "elementTitle": element.get("title"),
                "elementPageNumber": element.get("pageNumber"),
                "parentDocumentId": doc_data.get("parentDocumentId", ""),
            }
        )
        print(f"[DEBUG] Element match: {doc.id} ({doc_data.get('elementType')}), similarity={similarity}")

    # Sort by weightedScore descending
    results.sort(key=lambda x: x.get("weightedScore", 0), reverse=True)

    print(f"[DEBUG] Element search in {collection_id}: Found {len(results)} results")
    return results


def search_collection_debug(
    db,
    collection_id: str,
    query: str,
    limit: int,
    threshold: float,
    exact_terms: list[str] | None = None,
    semantic_terms: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Debug mode search: runs multiple permutations and tracks individual scores.

    Returns results with scoreBreakdown containing:
    - exactMatches: Which exact terms matched
    - semanticScores: Individual score for each semantic term
    - fullQueryScore: Score using the complete user query
    """
    docs_ref = db.collection(f"{collection_id}_documents")

    # Track scores per document: doc_id -> { docData, scoreBreakdown }
    doc_scores: dict[str, dict[str, Any]] = {}

    def get_or_init_doc(doc_id: str, doc_data: dict[str, Any]) -> dict[str, Any]:
        """Initialize or retrieve score tracking for a document."""
        if doc_id not in doc_scores:
            content = doc_data.get("content", {})
            doc_scores[doc_id] = {
                "docData": {
                    "documentId": doc_id,
                    "collectionId": collection_id,
                    "summary": content.get("summary", ""),
                    "keywords": content.get("keywords", []),
                    "fileName": doc_data.get("fileName", ""),
                    "storagePath": doc_data.get("storagePath", ""),
                },
                "scoreBreakdown": {
                    "exactMatches": [],
                    "semanticScores": [],
                    "fullQueryScore": None,
                },
            }
        return doc_scores[doc_id]

    print(f"[DEBUG-MODE] Starting multi-permutation search for collection {collection_id}")

    # Phase 1: Check exact keyword matches for each term
    if exact_terms:
        print(f"[DEBUG-MODE] Checking exact terms: {exact_terms}")
        for term in exact_terms:
            keyword_query = docs_ref.where(
                "content.keywords", "array_contains", term
            ).limit(limit * 2)

            for doc in keyword_query.get():
                doc_data = doc.to_dict()
                entry = get_or_init_doc(doc.id, doc_data)
                entry["scoreBreakdown"]["exactMatches"].append({
                    "term": term,
                    "matched": True,
                })
                print(f"[DEBUG-MODE] Exact match: {doc.id} for term '{term}'")

    # Phase 2: Run semantic search for EACH semantic term individually
    if semantic_terms:
        print(f"[DEBUG-MODE] Running individual semantic searches for: {semantic_terms}")
        for term in semantic_terms:
            term_vector = generate_embedding(term, task_type="RETRIEVAL_QUERY")
            term_results = docs_ref.find_nearest(
                vector_field="contentEmbedding.vector",
                query_vector=Vector(term_vector),
                distance_measure=DistanceMeasure.DOT_PRODUCT,
                limit=limit * 2,
                distance_result_field="vector_distance",
            ).get()

            for doc in term_results:
                doc_data = doc.to_dict()
                similarity = doc_data.get("vector_distance")
                entry = get_or_init_doc(doc.id, doc_data)
                entry["scoreBreakdown"]["semanticScores"].append({
                    "term": term,
                    "similarity": similarity,
                    "score": calculate_relevance_score(similarity),
                })
            print(f"[DEBUG-MODE] Semantic search for '{term}' found {len(term_results)} results")

    # Phase 3: Run semantic search with FULL query
    print(f"[DEBUG-MODE] Running full query search: '{query}'")
    full_query_vector = generate_embedding(query, task_type="RETRIEVAL_QUERY")
    full_results = docs_ref.find_nearest(
        vector_field="contentEmbedding.vector",
        query_vector=Vector(full_query_vector),
        distance_measure=DistanceMeasure.DOT_PRODUCT,
        limit=limit * 2,
        distance_result_field="vector_distance",
    ).get()

    for doc in full_results:
        doc_data = doc.to_dict()
        similarity = doc_data.get("vector_distance")
        entry = get_or_init_doc(doc.id, doc_data)
        entry["scoreBreakdown"]["fullQueryScore"] = {
            "query": query,
            "similarity": similarity,
            "score": calculate_relevance_score(similarity),
        }
    print(f"[DEBUG-MODE] Full query search found {len(full_results)} results")

    # Phase 4: Calculate combined score and build results
    results = []
    for doc_id, entry in doc_scores.items():
        breakdown = entry["scoreBreakdown"]
        doc_data = entry["docData"]

        # Calculate best score from all methods
        best_score = 0.0
        match_type = "semantic"

        # Check exact matches (boosted to 0.95)
        if breakdown["exactMatches"]:
            best_score = 0.95
            match_type = "exact"

        # Check semantic term scores
        for sem_score in breakdown["semanticScores"]:
            if sem_score["score"] > best_score:
                best_score = sem_score["score"]

        # Check full query score
        full_query = breakdown.get("fullQueryScore")
        if full_query and full_query.get("score", 0) > best_score:
            best_score = full_query["score"]

        # Get raw similarity from full query (for backwards compat)
        raw_similarity = full_query.get("similarity") if full_query else None

        # Apply threshold filtering (skip exact matches from filtering)
        if best_score < threshold and match_type != "exact":
            print(f"[DEBUG-MODE] Filtered out {doc_id} - best score {best_score:.3f} below threshold {threshold}")
            continue

        results.append({
            **doc_data,
            "rawSimilarity": raw_similarity,
            "weightedScore": best_score,
            "matchType": match_type,
            "scoreBreakdown": breakdown,
        })

    # Sort by weightedScore descending
    results.sort(key=lambda x: x.get("weightedScore", 0), reverse=True)

    # Limit results
    results = results[:limit]

    print(f"[DEBUG-MODE] Collection {collection_id}: Returning {len(results)} results")
    return results
