"""
Cloud Functions for Document Search Admin

Functions:
1. process_document - Gemini multimodal PDF analysis
2. on_metadata_write - Embedding trigger
3. classify_and_search - Agentic query classification + multi-collection search
4. get_collection_stats - Stats for dashboard
"""

import json
import os
from datetime import datetime
from typing import Any

import vertexai
from firebase_admin import firestore, initialize_app
from firebase_functions import https_fn, options
from google.cloud.firestore_v1.vector import Vector
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from vertexai.generative_models import GenerativeModel, Part
from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel

# Initialize Firebase Admin
initialize_app()

# Initialize Vertex AI
PROJECT_ID = os.environ.get("VERTEX_AI_PROJECT", os.environ.get("GCLOUD_PROJECT"))
LOCATION = os.environ.get("VERTEX_AI_LOCATION", "us-central1")
vertexai.init(project=PROJECT_ID, location=LOCATION)

# Database ID (non-default)
DATABASE_ID = os.environ.get("FIRESTORE_DATABASE_ID", "test")

# Models
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-001")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDING_DIMENSIONS = 2048  # Firestore max; gemini-embedding-001 supports up to 3072


def get_db():
    """Get Firestore client for the configured database."""
    return firestore.client(database_id=DATABASE_ID)


def get_collection_id_from_documents_path(documents_collection: str) -> str:
    """
    Extract collection ID from documents collection path.
    e.g., 'products_and_datasheets_documents' -> 'products_and_datasheets'
    """
    if documents_collection.endswith("_documents"):
        return documents_collection[:-10]  # Remove '_documents' suffix
    return documents_collection


# =============================================================================
# DOCUMENT PROCESSING (HTTP-callable, not triggers due to Firestore Enterprise limitations)
# =============================================================================


@https_fn.on_call(
    memory=options.MemoryOption.GB_1,
    timeout_sec=300,
)
def process_document(req: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Process a document using Gemini multimodal.

    HTTP-callable function (triggers not supported with non-default databases
    in Firestore Enterprise/multi-region).

    Input:
    - collectionId: The collection ID
    - documentId: The document ID to process

    Returns:
    - success: Whether processing succeeded
    - metadata: The extracted metadata (if successful)
    - error: Error message (if failed)
    """
    collection_id = req.data.get("collectionId")
    doc_id = req.data.get("documentId")

    if not collection_id or not doc_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="collectionId and documentId are required",
        )

    db = get_db()
    doc_ref = db.document(f"{collection_id}_documents/{doc_id}")
    doc_snapshot = doc_ref.get()

    if not doc_snapshot.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message=f"Document {doc_id} not found in {collection_id}",
        )

    doc_data = doc_snapshot.to_dict()

    print(f"Processing document {doc_id} in collection {collection_id}")

    try:
        # Update status to analyzing
        doc_ref.update({"status": "analyzing"})

        # Get the collection schema
        schema_ref = db.document(f"_system/config/schemas/{collection_id}")
        schema_doc = schema_ref.get()

        if not schema_doc.exists:
            raise ValueError(f"Schema not found for collection: {collection_id}")

        schema = schema_doc.to_dict()

        # Get the storage path
        storage_path = doc_data.get("storagePath")
        if not storage_path:
            raise ValueError("Document missing storagePath")

        # Build the prompt from schema fields
        prompt = build_extraction_prompt(schema)

        # Call Gemini to analyze the document
        metadata = analyze_document_with_gemini(storage_path, prompt)

        # Update the document with metadata
        doc_ref.update(
            {
                "content": {
                    **metadata,
                    "contentUpdatedAt": datetime.now().isoformat() + "Z",
                },
                "status": "metadata_ready",
                "processedAt": datetime.now().isoformat() + "Z",
            }
        )

        print(f"Successfully processed document {doc_id}")

        return {"success": True, "metadata": metadata}

    except Exception as e:
        print(f"Error processing document {doc_id}: {e}")
        doc_ref.update(
            {
                "status": "error",
                "error": str(e),
            }
        )
        return {"success": False, "error": str(e)}


@https_fn.on_call(
    memory=options.MemoryOption.GB_1,
    timeout_sec=540,
)
def process_pending_documents(req: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Process all pending documents in a collection.

    Input:
    - collectionId: The collection ID
    - limit: Max documents to process (default 10)

    Returns:
    - processed: Number of documents processed successfully
    - errors: Number of errors
    - details: Array of processing results
    """
    collection_id = req.data.get("collectionId")
    limit = req.data.get("limit", 10)

    if not collection_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="collectionId is required",
        )

    db = get_db()
    docs_ref = db.collection(f"{collection_id}_documents")

    # Find pending documents
    query = docs_ref.where("status", "==", "pending").limit(limit)
    docs = query.get()

    processed = 0
    errors = 0
    details = []

    # Get the schema once
    schema_ref = db.document(f"_system/config/schemas/{collection_id}")
    schema_doc = schema_ref.get()

    if not schema_doc.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message=f"Schema not found for collection: {collection_id}",
        )

    schema = schema_doc.to_dict()
    prompt = build_extraction_prompt(schema)

    for doc in docs:
        doc_id = doc.id
        doc_data = doc.to_dict()
        doc_ref = doc.reference

        try:
            doc_ref.update({"status": "analyzing"})

            storage_path = doc_data.get("storagePath")
            if not storage_path:
                raise ValueError("Document missing storagePath")

            metadata = analyze_document_with_gemini(storage_path, prompt)

            doc_ref.update(
                {
                    "content": {
                        **metadata,
                        "contentUpdatedAt": datetime.now().isoformat() + "Z",
                    },
                    "status": "metadata_ready",
                    "processedAt": datetime.now().isoformat() + "Z",
                }
            )

            processed += 1
            details.append({"documentId": doc_id, "success": True})

        except Exception as e:
            print(f"Error processing {doc_id}: {e}")
            doc_ref.update({"status": "error", "error": str(e)})
            errors += 1
            details.append({"documentId": doc_id, "success": False, "error": str(e)})

    return {"processed": processed, "errors": errors, "details": details}


def build_extraction_prompt(schema: dict[str, Any]) -> str:
    """Build the Gemini prompt from schema fields."""
    fields = schema.get("fields", [])
    gemini_fields = [f for f in fields if f.get("source") == "gemini"]

    field_descriptions = []
    for field in gemini_fields:
        field_desc = f"- {field['name']} ({field['type']})"
        if field.get("prompt"):
            field_desc += f": {field['prompt']}"
        if field.get("enum"):
            field_desc += f"\n  Allowed values: {', '.join(field['enum'])}"
        field_descriptions.append(field_desc)

    prompt = f"""Analyze this PDF document and extract the following metadata.
Return a JSON object with these fields:

{chr(10).join(field_descriptions)}

Guidelines:
- Read the entire document including any images, diagrams, or tables
- For 'summary': Write 2-3 sentences capturing the main topic and findings
- For 'keywords': Extract 5-10 technical terms as a JSON array of strings
- For enum fields: Return exactly one of the allowed values
- For array fields: Return a JSON array
- If a field cannot be determined, use null

Return ONLY valid JSON, no markdown code blocks or explanation."""

    return prompt


def analyze_document_with_gemini(storage_path: str, prompt: str) -> dict[str, Any]:
    """Analyze a PDF document using Gemini multimodal."""
    model = GenerativeModel(GEMINI_MODEL)

    # Create a Part from the Cloud Storage URI
    pdf_part = Part.from_uri(storage_path, mime_type="application/pdf")

    # Generate content
    response = model.generate_content(
        [pdf_part, prompt],
        generation_config={
            "temperature": 0.1,
            "max_output_tokens": 8192,
            "response_mime_type": "application/json",
        },
    )

    # Parse the response
    response_text = response.text.strip()

    # Handle markdown code blocks if present
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        # Remove first and last lines (```json and ```)
        response_text = "\n".join(lines[1:-1])

    return json.loads(response_text)


# =============================================================================
# EMBEDDING GENERATION (HTTP-callable, not triggers due to Firestore Enterprise limitations)
# =============================================================================


@https_fn.on_call(
    memory=options.MemoryOption.MB_512,
    timeout_sec=60,
)
def generate_document_embedding(req: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Generate embedding for a single document.

    HTTP-callable function (triggers not supported with non-default databases
    in Firestore Enterprise/multi-region).

    Input:
    - collectionId: The collection ID
    - documentId: The document ID

    Returns:
    - success: Whether embedding was generated
    - error: Error message (if failed)
    """
    collection_id = req.data.get("collectionId")
    doc_id = req.data.get("documentId")

    if not collection_id or not doc_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="collectionId and documentId are required",
        )

    db = get_db()
    doc_ref = db.document(f"{collection_id}_documents/{doc_id}")
    doc_snapshot = doc_ref.get()

    if not doc_snapshot.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message=f"Document {doc_id} not found in {collection_id}",
        )

    doc_data = doc_snapshot.to_dict()

    # Check if already has embedding
    if doc_data.get("contentEmbedding", {}).get("vector"):
        return {"success": True, "skipped": True, "reason": "Already has embedding"}

    print(f"Generating embedding for document {doc_id} in collection {collection_id}")

    try:
        # Update status
        doc_ref.update({"status": "embedding"})

        # Get content and build embedding text from all fields
        content = doc_data.get("content", {})
        embedding_text = build_embedding_text(content)

        if not embedding_text:
            raise ValueError("Document has no content for embedding")

        # Generate embedding
        vector = generate_embedding(embedding_text)

        # Update document with embedding
        doc_ref.update(
            {
                "contentEmbedding": {
                    "vector": Vector(vector),
                    "embeddedAt": datetime.now().isoformat() + "Z",
                    "modelVersion": EMBEDDING_MODEL,
                },
                "status": "ready",
            }
        )

        print(f"Successfully generated embedding for document {doc_id}")
        return {"success": True}

    except Exception as e:
        print(f"Error generating embedding for {doc_id}: {e}")
        doc_ref.update(
            {
                "status": "error",
                "error": f"Embedding generation failed: {str(e)}",
            }
        )
        return {"success": False, "error": str(e)}


@https_fn.on_call(
    memory=options.MemoryOption.GB_1,
    timeout_sec=300,
)
def generate_embeddings_for_ready_docs(req: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Generate embeddings for all documents in metadata_ready status.

    Input:
    - collectionId: The collection ID
    - limit: Max documents to process (default 50)

    Returns:
    - processed: Number of documents processed
    - errors: Number of errors
    - details: Array of results
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

    # Find documents in metadata_ready status
    query = docs_ref.where("status", "==", "metadata_ready").limit(limit)
    docs = query.get()

    processed = 0
    errors = 0
    details = []

    for doc in docs:
        doc_id = doc.id
        doc_data = doc.to_dict()
        doc_ref = doc.reference

        try:
            doc_ref.update({"status": "embedding"})

            content = doc_data.get("content", {})
            embedding_text = build_embedding_text(content)

            if not embedding_text:
                raise ValueError("No content for embedding")

            vector = generate_embedding(embedding_text)

            doc_ref.update(
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
            details.append({"documentId": doc_id, "success": True})

        except Exception as e:
            print(f"Error generating embedding for {doc_id}: {e}")
            doc_ref.update({"status": "error", "error": str(e)})
            errors += 1
            details.append({"documentId": doc_id, "success": False, "error": str(e)})

    return {"processed": processed, "errors": errors, "details": details}


def build_embedding_text(content: dict[str, Any]) -> str:
    """
    Build embedding text from all content fields except contentUpdatedAt.

    Handles different field types:
    - Strings: included as-is
    - Arrays: joined with commas
    - Other types: converted to string

    Returns formatted text suitable for embedding generation.
    """
    if not content:
        return ""

    # Fields to exclude from embedding
    excluded_fields = {"contentUpdatedAt"}

    # Build text parts
    parts = []

    # Process summary first if it exists (most important for context)
    if "summary" in content and content["summary"]:
        parts.append(content["summary"])

    # Process all other fields
    for key, value in content.items():
        if key in excluded_fields or key == "summary":
            continue
        if value is None:
            continue

        # Format the field name for display
        field_name = key.replace("_", " ").title()

        if isinstance(value, list):
            if value:  # Only include non-empty lists
                value_str = ", ".join(str(v) for v in value)
                parts.append(f"{field_name}: {value_str}")
        elif isinstance(value, str):
            if value.strip():  # Only include non-empty strings
                parts.append(f"{field_name}: {value}")
        else:
            # Convert other types to string
            parts.append(f"{field_name}: {value}")

    return "\n".join(parts)


def generate_embedding(text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> list[float]:
    """
    Generate an embedding vector for the given text.

    Args:
        text: The text to embed
        task_type: The embedding task type. Use:
            - "RETRIEVAL_DOCUMENT" for documents (corpus)
            - "RETRIEVAL_QUERY" for search queries
    """
    model = TextEmbeddingModel.from_pretrained(EMBEDDING_MODEL)

    inputs = [TextEmbeddingInput(text, task_type)]
    embeddings = model.get_embeddings(inputs, output_dimensionality=EMBEDDING_DIMENSIONS)

    return embeddings[0].values


# =============================================================================
# AGENTIC SEARCH
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
    import time

    start_time = time.time()

    query = req.data.get("query", "")
    limit = req.data.get("limit", 10)
    # DOT_PRODUCT threshold: minimum similarity to include (0.3 = moderately similar)
    threshold = req.data.get("threshold", 0.3)
    # Model selection and thinking level
    model_name = req.data.get("model", "gemini-3-pro-preview")
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

    # Always search primary collection
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

    # Sort results by weighted score
    results.sort(key=lambda x: x.get("weightedScore", 0), reverse=True)

    # Limit total results
    results = results[:limit]

    search_time_ms = int((time.time() - start_time) * 1000)

    return {
        "results": results,
        "classification": classification,
        "searchMetadata": {
            "collectionsSearched": collections_searched,
            "totalCandidates": len(results),
            "searchTimeMs": search_time_ms,
        },
    }


def classify_query(
    query: str,
    schemas: list[dict[str, Any]],
    model_name: str = "gemini-3-pro-preview",
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
        collections_info.append(
            f"""- {coll.get('id')} ("{coll.get('display_name')}")
  Description: {coll.get('description', '')}
  Keywords: {', '.join(hints.get('keywords', [])[:10])}
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

    # Configure generation with thinking
    config = types.GenerateContentConfig(
        temperature=0.1,
        max_output_tokens=8192,
        response_mime_type="application/json",
        thinking_config=types.ThinkingConfig(
            thinking_level=thinking_level,  # "LOW" or "HIGH"
        ),
    )

    print(f"[DEBUG] classify_query: model={model_name}, thinking_level={thinking_level}")

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
            }
        )
        seen_doc_ids.add(doc.id)

    # Sort by weightedScore descending
    results.sort(key=lambda x: x.get("weightedScore", 0), reverse=True)

    print(f"[DEBUG] Collection {collection_id}: Found {len(results)} results (exact: {sum(1 for r in results if r.get('matchType') == 'exact')}, semantic: {sum(1 for r in results if r.get('matchType') == 'semantic')})")
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


# =============================================================================
# UTILITY FUNCTIONS
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


# =============================================================================
# INDEX MANAGEMENT
# =============================================================================


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
