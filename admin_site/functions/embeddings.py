"""
Embedding Generation Module

Cloud Functions and utilities for generating vector embeddings:
- generate_document_embedding: Single document embedding
- generate_embeddings_for_ready_docs: Batch embedding for ready documents
- build_embedding_text: Format content fields for embedding
- generate_embedding: Call Vertex AI embedding model
"""

from datetime import datetime
from typing import Any

from firebase_functions import https_fn, options
from google.cloud.firestore_v1.vector import Vector
from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel

from common import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, get_db


# =============================================================================
# ENTRY POINTS
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


# =============================================================================
# HELPER FUNCTIONS (exported for use by other modules)
# =============================================================================


def build_embedding_text(content: dict[str, Any]) -> str:
    """
    Build embedding text from all content fields except contentUpdatedAt.

    Handles different field types:
    - Strings: included as-is
    - Arrays: joined with commas
    - Chapters: formatted as "Document Sections:" block
    - Other types: converted to string

    Returns formatted text suitable for embedding generation.
    """
    if not content:
        return ""

    # Fields to exclude from embedding (handled separately or not needed)
    excluded_fields = {"contentUpdatedAt", "chapters"}

    # Build text parts
    parts = []

    # 1. Process summary first if it exists (most important for context)
    if "summary" in content and content["summary"]:
        parts.append(content["summary"])

    # 2. Process chapter summaries (adds section-level detail to embedding)
    chapters = content.get("chapters", [])
    if chapters:
        chapter_texts = []
        # Sort by order to maintain document structure
        for chapter in sorted(chapters, key=lambda c: c.get("order", 0)):
            title = chapter.get("title", "")
            summary = chapter.get("summary", "")
            if title and summary:
                chapter_texts.append(f"{title}: {summary}")
            elif summary:
                chapter_texts.append(summary)
        if chapter_texts:
            parts.append("Document Sections:\n" + "\n".join(chapter_texts))

    # 3. Process tables (add table summaries to embedding)
    tables = content.get("tables", [])
    if tables:
        table_texts = []
        for table in sorted(tables, key=lambda t: t.get("order", 0)):
            title = table.get("title", "")
            description = table.get("description", "")
            if title and description:
                table_texts.append(f"{title}: {description}")
            elif description:
                table_texts.append(description)
        if table_texts:
            parts.append("Tables:\n" + "\n".join(table_texts))

    # 4. Process figures (add figure summaries to embedding)
    figures = content.get("figures", [])
    if figures:
        figure_texts = []
        for figure in sorted(figures, key=lambda f: f.get("order", 0)):
            title = figure.get("title", "")
            description = figure.get("description", "")
            insights = figure.get("dataInsights", "")
            parts_list = [p for p in [title, description, insights] if p]
            if parts_list:
                figure_texts.append(": ".join(parts_list[:2]))  # title: description or just description
        if figure_texts:
            parts.append("Figures:\n" + "\n".join(figure_texts))

    # 5. Process images (add image summaries to embedding)
    images = content.get("images", [])
    if images:
        image_texts = []
        for image in sorted(images, key=lambda i: i.get("order", 0)):
            title = image.get("title", "")
            description = image.get("description", "")
            if title and description:
                image_texts.append(f"{title}: {description}")
            elif description:
                image_texts.append(description)
        if image_texts:
            parts.append("Images:\n" + "\n".join(image_texts))

    # 6. Process all other fields
    # Fields to exclude from this loop (already handled above)
    element_fields = {"tables", "figures", "images", "elementCounts"}
    for key, value in content.items():
        if key in excluded_fields or key == "summary" or key in element_fields:
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


def build_element_embedding_text(element: dict[str, Any], element_type: str) -> str:
    """
    Build embedding text for an extracted element (table, figure, or image).

    The text is formatted to capture the element's semantic content for search.
    """
    parts = []

    # Common fields
    title = element.get("title")
    if title:
        parts.append(title)

    description = element.get("description", "")
    if description:
        parts.append(description)

    if element_type == "table":
        # Include column headers and data preview
        headers = element.get("columnHeaders", [])
        if headers:
            parts.append(f"Columns: {', '.join(headers)}")
        data_preview = element.get("dataPreview", "")
        if data_preview:
            parts.append(f"Data: {data_preview}")

    elif element_type == "figure":
        # Include figure type and insights
        figure_type = element.get("figureType", "")
        if figure_type:
            parts.append(f"Type: {figure_type}")
        visual_elements = element.get("visualElements", [])
        if visual_elements:
            parts.append(f"Visual elements: {', '.join(visual_elements)}")
        insights = element.get("dataInsights", "")
        if insights:
            parts.append(f"Insights: {insights}")

    elif element_type == "image":
        # Include image type and subjects
        image_type = element.get("imageType", "")
        if image_type:
            parts.append(f"Type: {image_type}")
        subjects = element.get("subjects", [])
        if subjects:
            parts.append(f"Subjects: {', '.join(subjects)}")
        context = element.get("context", "")
        if context:
            parts.append(f"Context: {context}")

    return "\n".join(parts)


# =============================================================================
# ELEMENT EMBEDDING FUNCTIONS
# =============================================================================


@https_fn.on_call(
    memory=options.MemoryOption.GB_1,
    timeout_sec=300,
)
def generate_element_embeddings_for_document(
    req: https_fn.CallableRequest,
) -> dict[str, Any]:
    """
    Generate embeddings for all pending elements in a document's subcollection.

    Input:
    - collectionId: The collection ID
    - documentId: The parent document ID

    Returns:
    - processed: Number of elements embedded
    - errors: Number of errors
    - details: Array of results
    """
    collection_id = req.data.get("collectionId")
    doc_id = req.data.get("documentId")

    if not collection_id or not doc_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="collectionId and documentId are required",
        )

    db = get_db()
    elements_ref = db.collection(f"{collection_id}_documents/{doc_id}/elements")

    # Find pending elements
    query = elements_ref.where("status", "==", "pending").limit(50)
    elements = query.get()

    processed = 0
    errors = 0
    details = []

    for element_doc in elements:
        element_id = element_doc.id
        element_data = element_doc.to_dict()
        element_ref = element_doc.reference

        try:
            element_type = element_data.get("elementType", "")
            element = element_data.get("element", {})

            # Build embedding text
            embedding_text = build_element_embedding_text(element, element_type)

            if not embedding_text:
                raise ValueError("Element has no content for embedding")

            # Generate embedding
            vector = generate_embedding(embedding_text)

            # Update element with embedding
            element_ref.update(
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
            details.append({"elementId": element_id, "success": True})
            print(f"Generated embedding for element {element_id}")

        except Exception as e:
            print(f"Error generating embedding for element {element_id}: {e}")
            element_ref.update({"status": "error", "error": str(e)})
            errors += 1
            details.append({"elementId": element_id, "success": False, "error": str(e)})

    return {"processed": processed, "errors": errors, "details": details}


@https_fn.on_call(
    memory=options.MemoryOption.GB_1,
    timeout_sec=540,
)
def generate_all_element_embeddings(req: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Generate embeddings for all pending elements across all documents in a collection.

    Input:
    - collectionId: The collection ID
    - limit: Max elements to process (default 100)

    Returns:
    - processed: Number of elements embedded
    - errors: Number of errors
    - details: Array of results
    """
    collection_id = req.data.get("collectionId")
    limit = req.data.get("limit", 100)

    if not collection_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="collectionId is required",
        )

    db = get_db()

    # Use collection group query to find all pending elements
    # Note: Requires a collection group index on "status" field
    elements_query = (
        db.collection_group("elements")
        .where("collectionId", "==", collection_id)
        .where("status", "==", "pending")
        .limit(limit)
    )

    elements = elements_query.get()

    processed = 0
    errors = 0
    details = []

    for element_doc in elements:
        element_id = element_doc.id
        element_data = element_doc.to_dict()
        element_ref = element_doc.reference

        try:
            element_type = element_data.get("elementType", "")
            element = element_data.get("element", {})

            # Build embedding text
            embedding_text = build_element_embedding_text(element, element_type)

            if not embedding_text:
                raise ValueError("Element has no content for embedding")

            # Generate embedding
            vector = generate_embedding(embedding_text)

            # Update element with embedding
            element_ref.update(
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
            details.append({
                "elementId": element_id,
                "parentDocId": element_data.get("parentDocumentId"),
                "success": True,
            })
            print(f"Generated embedding for element {element_id}")

        except Exception as e:
            print(f"Error generating embedding for element {element_id}: {e}")
            element_ref.update({"status": "error", "error": str(e)})
            errors += 1
            details.append({
                "elementId": element_id,
                "success": False,
                "error": str(e),
            })

    return {"processed": processed, "errors": errors, "details": details}
