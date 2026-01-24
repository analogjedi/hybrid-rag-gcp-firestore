"""
Document Processing Module

Cloud Functions for document analysis using Gemini multimodal:
- process_document: Single document Gemini analysis
- process_pending_documents: Batch processing for pending documents
- build_extraction_prompt: Build prompt from schema fields
- analyze_document_with_gemini: Call Gemini multimodal API
"""

import json
from datetime import datetime
from typing import Any

from firebase_functions import https_fn, options
from vertexai.generative_models import GenerativeModel, Part

from common import GEMINI_MODEL, get_db


# =============================================================================
# ENTRY POINTS
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

        # Create element documents for tables, figures, and images
        element_count = create_element_documents(
            db, collection_id, doc_id, metadata, doc_data
        )

        # Aggregate document keywords to collection schema for classifier
        keywords = metadata.get("keywords", [])
        if keywords:
            update_collection_keywords(db, collection_id, keywords)

        print(f"Successfully processed document {doc_id} with {element_count} elements")

        return {
            "success": True,
            "metadata": metadata,
            "elementsCreated": element_count,
        }

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
    memory=options.MemoryOption.MB_512,
    timeout_sec=120,
)
def rebuild_collection_keywords(req: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Rebuild the aggregated document keywords for a collection.

    This scans all documents in the collection and rebuilds the keyword
    frequency counts from scratch. Useful for:
    - Initial setup after deploying this feature
    - Debugging/testing classifier routing
    - Recovering from inconsistent state

    Input:
    - collectionId: The collection ID to rebuild keywords for

    Returns:
    - success: Whether rebuild succeeded
    - documentsScanned: Number of documents processed
    - uniqueKeywords: Number of unique keywords found
    - keywords: The rebuilt keyword frequencies (for debugging)
    """
    collection_id = req.data.get("collectionId")

    if not collection_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="collectionId is required",
        )

    db = get_db()

    # Scan all documents in the collection
    docs_ref = db.collection(f"{collection_id}_documents")
    docs = docs_ref.stream()

    # Aggregate keywords
    keyword_counts: dict[str, int] = {}
    documents_scanned = 0

    for doc in docs:
        documents_scanned += 1
        doc_data = doc.to_dict()
        content = doc_data.get("content", {})
        keywords = content.get("keywords", [])

        for keyword in keywords:
            # Sanitize keyword for Firestore field path
            safe_keyword = keyword.replace(".", "_").replace("/", "_")
            keyword_counts[safe_keyword] = keyword_counts.get(safe_keyword, 0) + 1

    # Update the schema with rebuilt keywords
    schema_ref = db.document(f"_system/config/schemas/{collection_id}")

    # Clear existing and set new keywords
    schema_ref.update({
        "classifier_hints.document_keywords": keyword_counts
    })

    print(f"Rebuilt keywords for {collection_id}: {documents_scanned} docs, {len(keyword_counts)} unique keywords")

    return {
        "success": True,
        "documentsScanned": documents_scanned,
        "uniqueKeywords": len(keyword_counts),
        "keywords": keyword_counts,
    }


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

            # Create element documents
            element_count = create_element_documents(
                db, collection_id, doc_id, metadata, doc_data
            )

            # Aggregate document keywords to collection schema for classifier
            keywords = metadata.get("keywords", [])
            if keywords:
                update_collection_keywords(db, collection_id, keywords)

            processed += 1
            details.append({
                "documentId": doc_id,
                "success": True,
                "elementsCreated": element_count,
            })

        except Exception as e:
            print(f"Error processing {doc_id}: {e}")
            doc_ref.update({"status": "error", "error": str(e)})
            errors += 1
            details.append({"documentId": doc_id, "success": False, "error": str(e)})

    return {"processed": processed, "errors": errors, "details": details}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def update_collection_keywords(
    db,
    collection_id: str,
    keywords: list[str],
) -> None:
    """
    Update the collection schema's document_keywords with keyword frequencies.

    This aggregates keywords from all documents in the collection to help
    the classifier route queries to the correct collection.

    Args:
        db: Firestore client
        collection_id: Collection ID
        keywords: List of keywords from the processed document
    """
    from google.cloud.firestore import Increment

    schema_ref = db.document(f"_system/config/schemas/{collection_id}")

    # Update keyword frequencies using atomic increment
    # This ensures concurrent document processing doesn't lose counts
    updates = {}
    for keyword in keywords:
        # Sanitize keyword for Firestore field path (no dots, slashes)
        safe_keyword = keyword.replace(".", "_").replace("/", "_")
        field_path = f"classifier_hints.document_keywords.{safe_keyword}"
        updates[field_path] = Increment(1)

    if updates:
        try:
            schema_ref.update(updates)
            print(f"Updated {len(keywords)} keywords for collection {collection_id}")
        except Exception as e:
            # Log but don't fail document processing if keyword update fails
            print(f"Warning: Failed to update collection keywords: {e}")


def create_element_documents(
    db,
    collection_id: str,
    doc_id: str,
    metadata: dict[str, Any],
    doc_data: dict[str, Any],
) -> int:
    """
    Create element documents in the subcollection for tables, figures, and images.

    Args:
        db: Firestore client
        collection_id: Parent collection ID
        doc_id: Parent document ID
        metadata: Extracted metadata containing tables, figures, images
        doc_data: Original document data (for denormalized fields)

    Returns:
        Number of element documents created
    """
    elements_ref = db.collection(f"{collection_id}_documents/{doc_id}/elements")
    created_count = 0

    # Get denormalized fields from parent document
    parent_file_name = doc_data.get("fileName", "")
    parent_storage_path = doc_data.get("storagePath", "")

    # Process all element types
    all_elements = []

    for table in metadata.get("tables", []):
        all_elements.append(("table", table))

    for figure in metadata.get("figures", []):
        all_elements.append(("figure", figure))

    for image in metadata.get("images", []):
        all_elements.append(("image", image))

    # Cap at 50 elements per document
    all_elements = all_elements[:50]

    for element_type, element in all_elements:
        element_id = element.get("id", f"{element_type}_{created_count + 1}")

        element_doc = {
            "parentDocumentId": doc_id,
            "collectionId": collection_id,
            "elementType": element_type,
            "element": element,
            "parentFileName": parent_file_name,
            "parentStoragePath": parent_storage_path,
            "status": "pending",  # Will be set to "ready" after embedding
            "createdAt": datetime.now().isoformat() + "Z",
        }

        elements_ref.document(element_id).set(element_doc)
        created_count += 1
        print(f"Created element document: {element_id}")

    return created_count


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

    # Add chapters field for document structure extraction
    chapter_instruction = """- chapters (array): Identify the document's structure and extract chapter/section summaries.
  For each chapter or major section, return an object with:
  {
    "title": "Chapter or section title",
    "summary": "2-3 sentence summary of this section's content",
    "pageStart": null,
    "pageEnd": null,
    "level": 1,
    "order": 0
  }

  Guidelines for chapters:
  - Look for numbered chapters, titled sections, or clear topic divisions
  - For short documents (< 5 pages) without clear chapters, return []
  - For datasheets, treat standard sections (Features, Specs, Applications, etc.) as chapters
  - Maximum 20 chapters/sections
  - Use null for page numbers if not determinable
  - level: 1=chapter, 2=section within a chapter
  - order: Sequential position starting from 0"""

    # Add tables extraction
    tables_instruction = """- tables (array): Extract all significant tables from the document.
  For each table, return an object with:
  {
    "id": "table_1",
    "type": "table",
    "title": "Table caption or title (null if none)",
    "description": "1-2 sentence description of what this table shows",
    "pageNumber": null,
    "order": 0,
    "columnHeaders": ["Column1", "Column2"],
    "rowCount": 5,
    "dataPreview": "First 2-3 rows as readable text"
  }

  Guidelines for tables:
  - Include tables with data, specifications, parameters, comparisons
  - Skip trivial layout tables (e.g., header/footer layouts)
  - Maximum 20 tables per document
  - For dataPreview, format as "Row1Col1 | Row1Col2 | Row1Col3; Row2Col1 | ..."
  - order: Sequential position starting from 0"""

    # Add figures extraction
    figures_instruction = """- figures (array): Extract all charts, diagrams, graphs, and schematics.
  For each figure, return an object with:
  {
    "id": "figure_1",
    "type": "figure",
    "title": "Figure caption or title (null if none)",
    "description": "2-3 sentence description of what the figure shows",
    "pageNumber": null,
    "order": 0,
    "figureType": "chart",
    "visualElements": ["bars", "legend", "x-axis label"],
    "dataInsights": "Key takeaway or insight from this figure"
  }

  Guidelines for figures:
  - figureType: "chart" | "diagram" | "graph" | "schematic" | "other"
  - Include block diagrams, flowcharts, circuit schematics, performance graphs
  - visualElements: List visible components (axes, legends, labels, arrows, etc.)
  - Maximum 20 figures per document
  - order: Sequential position starting from 0"""

    # Add images extraction
    images_instruction = """- images (array): Extract significant photos, screenshots, illustrations, and logos.
  For each image, return an object with:
  {
    "id": "image_1",
    "type": "image",
    "title": "Image caption or title (null if none)",
    "description": "1-2 sentence description of what the image shows",
    "pageNumber": null,
    "order": 0,
    "imageType": "photo",
    "subjects": ["product name", "component"],
    "context": "How this image relates to the document content"
  }

  Guidelines for images:
  - imageType: "photo" | "screenshot" | "logo" | "illustration" | "other"
  - Include product photos, application examples, UI screenshots
  - Skip decorative images, backgrounds, icons
  - subjects: List main subjects depicted
  - Maximum 10 images per document
  - order: Sequential position starting from 0"""

    prompt = f"""Analyze this PDF document and extract the following metadata.
Return a JSON object with these fields:

{chr(10).join(field_descriptions)}

{chapter_instruction}

{tables_instruction}

{figures_instruction}

{images_instruction}

Guidelines:
- Read the entire document including any images, diagrams, or tables
- For 'summary': Write 2-3 sentences capturing the main topic and findings
- For 'keywords': Extract 5-10 technical terms as a JSON array of strings
- For enum fields: Return exactly one of the allowed values
- For array fields: Return a JSON array
- If a field cannot be determined, use null
- For tables, figures, and images: Only include significant content, skip decorative elements
- Maximum 50 total elements (tables + figures + images) per document

Return ONLY valid JSON, no markdown code blocks or explanation."""

    return prompt


def analyze_document_with_gemini(storage_path: str, prompt: str) -> dict[str, Any]:
    """Analyze a PDF document using Gemini multimodal."""
    model = GenerativeModel(GEMINI_MODEL)

    # Create a Part from the Cloud Storage URI
    pdf_part = Part.from_uri(storage_path, mime_type="application/pdf")

    # Generate content with higher token limit for large documents
    response = model.generate_content(
        [pdf_part, prompt],
        generation_config={
            "temperature": 0.1,
            "max_output_tokens": 16384,  # Increased for documents with many elements
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

    # Attempt to parse JSON with better error handling
    try:
        metadata = json.loads(response_text)
    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        print(f"Response length: {len(response_text)} chars")
        print(f"Response preview (last 500 chars): ...{response_text[-500:]}")

        # Try to repair truncated JSON by finding the last complete object
        # This handles cases where the response was cut off
        repair_attempts = [
            response_text + ']}',      # Missing closing brackets
            response_text + '"}]}',    # Missing quote and brackets
            response_text + '"}]}'     # Missing quote and single bracket
        ]

        for attempt in repair_attempts:
            try:
                metadata = json.loads(attempt)
                print("Successfully repaired truncated JSON")
                break
            except json.JSONDecodeError:
                continue
        else:
            # If repair failed, raise with more context
            raise ValueError(
                f"Failed to parse Gemini response as JSON. "
                f"Response length: {len(response_text)} chars. "
                f"Error: {e}. "
                f"This may indicate the response was truncated due to token limits."
            )

    # Normalize chapters field
    if "chapters" not in metadata or metadata["chapters"] is None:
        metadata["chapters"] = []

    # Ensure each chapter has required fields with defaults
    for i, chapter in enumerate(metadata.get("chapters", [])):
        if "order" not in chapter:
            chapter["order"] = i
        if "title" not in chapter:
            chapter["title"] = f"Section {i + 1}"
        if "summary" not in chapter:
            chapter["summary"] = ""
        if "level" not in chapter:
            chapter["level"] = 1

    # Normalize tables field
    if "tables" not in metadata or metadata["tables"] is None:
        metadata["tables"] = []

    for i, table in enumerate(metadata.get("tables", [])):
        if "id" not in table:
            table["id"] = f"table_{i + 1}"
        if "type" not in table:
            table["type"] = "table"
        if "order" not in table:
            table["order"] = i
        if "description" not in table:
            table["description"] = ""
        if "columnHeaders" not in table:
            table["columnHeaders"] = []
        if "dataPreview" not in table:
            table["dataPreview"] = ""

    # Normalize figures field
    if "figures" not in metadata or metadata["figures"] is None:
        metadata["figures"] = []

    for i, figure in enumerate(metadata.get("figures", [])):
        if "id" not in figure:
            figure["id"] = f"figure_{i + 1}"
        if "type" not in figure:
            figure["type"] = "figure"
        if "order" not in figure:
            figure["order"] = i
        if "description" not in figure:
            figure["description"] = ""
        if "figureType" not in figure:
            figure["figureType"] = "other"
        if "visualElements" not in figure:
            figure["visualElements"] = []
        if "dataInsights" not in figure:
            figure["dataInsights"] = ""

    # Normalize images field
    if "images" not in metadata or metadata["images"] is None:
        metadata["images"] = []

    for i, image in enumerate(metadata.get("images", [])):
        if "id" not in image:
            image["id"] = f"image_{i + 1}"
        if "type" not in image:
            image["type"] = "image"
        if "order" not in image:
            image["order"] = i
        if "description" not in image:
            image["description"] = ""
        if "imageType" not in image:
            image["imageType"] = "other"
        if "subjects" not in image:
            image["subjects"] = []
        if "context" not in image:
            image["context"] = ""

    # Add element counts
    metadata["elementCounts"] = {
        "tables": len(metadata["tables"]),
        "figures": len(metadata["figures"]),
        "images": len(metadata["images"]),
    }

    return metadata
