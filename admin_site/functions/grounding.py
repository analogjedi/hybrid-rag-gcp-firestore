"""
Grounded Answer Generation Module

Cloud Functions for generating answers grounded in retrieved documents:
- generate_grounded_answer: Generate LLM response with citations using actual PDFs
- format_conversation_history: Format conversation history
"""

import json
import os
from typing import Any

from firebase_functions import https_fn, options


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def format_conversation_history(history: list[dict[str, str]] | None) -> str:
    """Format conversation history for context."""
    if not history:
        return ""

    formatted = []
    for msg in history[-6:]:  # Keep last 6 messages for context
        role = "User" if msg.get("role") == "user" else "Assistant"
        formatted.append(f"{role}: {msg.get('content', '')}")

    return "Previous conversation:\n" + "\n".join(formatted) + "\n\n"


def build_document_reference_list(documents: list[dict[str, Any]]) -> str:
    """Build a detailed reference list including document structure for granular citations."""
    refs = []
    for i, doc in enumerate(documents):
        doc_num = i + 1
        ref_lines = [f"[Doc {doc_num}]: {doc.get('fileName', 'Unknown')}"]

        # Add element-specific info if this is an element result
        if doc.get("elementType"):
            element_type = doc.get("elementType", "").title()
            element_title = doc.get("elementTitle") or doc.get("elementId", "")
            page_num = doc.get("elementPageNumber")

            element_info = f"  (Matched {element_type}: {element_title}"
            if page_num:
                element_info += f", page {page_num}"
            element_info += ")"
            ref_lines.append(element_info)

        # Add table of contents if chapters are available
        chapters = doc.get("chapters", [])
        if chapters:
            ref_lines.append("  Table of Contents:")
            for chapter in chapters[:10]:  # Limit to first 10 chapters
                title = chapter.get("title", "Untitled")
                page_start = chapter.get("pageStart")
                page_end = chapter.get("pageEnd")
                if page_start and page_end:
                    ref_lines.append(f"    - \"{title}\" (pp. {page_start}-{page_end})")
                elif page_start:
                    ref_lines.append(f"    - \"{title}\" (p. {page_start})")
                else:
                    ref_lines.append(f"    - \"{title}\"")

        # Add figure list if figures are available
        figures = doc.get("figures", [])
        if figures:
            ref_lines.append(f"  Figures ({len(figures)} total):")
            for fig in figures[:5]:  # Show first 5 figures
                fig_title = fig.get("title") or fig.get("id", "Figure")
                page_num = fig.get("pageNumber")
                fig_type = fig.get("figureType", "")
                if page_num:
                    ref_lines.append(f"    - {fig_title} ({fig_type}, p. {page_num})")
                else:
                    ref_lines.append(f"    - {fig_title} ({fig_type})")
            if len(figures) > 5:
                ref_lines.append(f"    ... and {len(figures) - 5} more figures")

        # Add table list if tables are available
        tables = doc.get("tables", [])
        if tables:
            ref_lines.append(f"  Tables ({len(tables)} total):")
            for tbl in tables[:5]:  # Show first 5 tables
                tbl_title = tbl.get("title") or tbl.get("id", "Table")
                page_num = tbl.get("pageNumber")
                if page_num:
                    ref_lines.append(f"    - {tbl_title} (p. {page_num})")
                else:
                    ref_lines.append(f"    - {tbl_title}")
            if len(tables) > 5:
                ref_lines.append(f"    ... and {len(tables) - 5} more tables")

        refs.append("\n".join(ref_lines))

    return "\n\n".join(refs)


# =============================================================================
# ENTRY POINTS
# =============================================================================


@https_fn.on_call(
    memory=options.MemoryOption.GB_2,  # More memory for PDF processing
    timeout_sec=180,  # Longer timeout for multimodal
    secrets=["GEMINI_API_KEY"],
)
def generate_grounded_answer(req: https_fn.CallableRequest) -> dict[str, Any]:
    """
    Generate an answer grounded in retrieved documents using Gemini multimodal.

    This function actually fetches and reads the PDF documents from Cloud Storage,
    sends them to Gemini along with the user's question, and generates a properly
    grounded answer based on the full document content.

    Input:
        - query: User's question
        - documents: Retrieved document metadata including storagePath
        - conversationHistory: Previous messages (optional)

    Returns:
        - answer: Generated response grounded in actual document content
        - citations: List of document references used
        - confidence: How well the docs support the answer
    """
    from google import genai
    from google.genai import types

    query = req.data.get("query", "")
    documents = req.data.get("documents", [])
    conversation_history = req.data.get("conversationHistory", [])

    if not query:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Query is required",
        )

    if not documents:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="At least one document is required for grounding",
        )

    # Get API key from environment
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            message="GEMINI_API_KEY not configured",
        )

    # Create client with Vertex AI
    client = genai.Client(vertexai=True, api_key=api_key)

    # Build the content parts: PDFs first, then the prompt
    content_parts = []
    valid_docs = []

    # Add each PDF document as a multimodal part
    for i, doc in enumerate(documents):
        storage_path = doc.get("storagePath")
        if storage_path and storage_path.startswith("gs://"):
            try:
                # Create a file part from the Cloud Storage URI
                pdf_part = types.Part.from_uri(
                    file_uri=storage_path,
                    mime_type="application/pdf"
                )
                content_parts.append(pdf_part)
                valid_docs.append(doc)
                print(f"[GROUNDED] Added PDF {i + 1}: {doc.get('fileName')} from {storage_path}")
            except Exception as e:
                print(f"[GROUNDED] Warning: Could not load PDF {storage_path}: {e}")
        else:
            print(f"[GROUNDED] Skipping doc {i + 1}: no valid storagePath")

    if not valid_docs:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="No valid documents with storagePath found",
        )

    # Build the conversation context
    conv_context = format_conversation_history(conversation_history)

    # Build the prompt - referencing the attached documents
    prompt = f"""{conv_context}I have attached {len(valid_docs)} PDF document(s) for you to reference:

{build_document_reference_list(valid_docs)}

User Question: {query}

Instructions:
1. Read and analyze the attached PDF document(s) thoroughly
2. Answer the user's question based ONLY on information found in these documents
3. **IMPORTANT - Use granular citations**: When citing, be as specific as possible:
   - For section/chapter references: [Doc 1, "Part 2: Settling In", pp. 9-20]
   - For figure references: [Doc 1, Fig. 2-1, p. 12]
   - For table references: [Doc 1, Table 3, p. 45]
   - For general document references: [Doc 1]
   - Use the section titles and page numbers from the Table of Contents above
4. If the documents don't contain enough information to fully answer, say so clearly
5. Provide a detailed, helpful answer - don't just give one sentence if more detail is available
6. If the question asks about processes, procedures, or policies, explain them step by step

Return a JSON object with:
- "answer": Your detailed response with GRANULAR citation markers (include section names and page numbers when relevant)
- "cited_documents": Array of document indices (1-indexed) that you referenced
- "confidence": Number 0.0-1.0 indicating how well the documents answered the question
- "relevance_notes": Object mapping document indices (as strings) to brief notes about which specific sections were most relevant

Example:
{{
  "answer": "According to the employee handbook, the hiring process involves several steps. First, candidates submit applications through the company website [Doc 1, \"Part 5: Hiring\", pp. 30-33]. The document emphasizes that hiring is considered 'the most important thing in the universe' at Valve [Doc 1, \"Part 5: Hiring\", p. 30]. The process typically involves peer interviews where existing employees evaluate both skills and cultural fit [Doc 1, \"Part 5: Hiring\", pp. 31-32]. Figure 5-1 illustrates how hiring connects to all other company activities [Doc 1, Fig. 5-1, p. 30].",
  "cited_documents": [1],
  "confidence": 0.95,
  "relevance_notes": {{
    "1": "Part 5: Hiring (pp. 30-33) contains detailed hiring process information; Fig. 5-1 shows hiring's central importance"
  }}
}}

Return ONLY valid JSON, no markdown code blocks."""

    # Add the prompt as the final part
    content_parts.append(types.Part(text=prompt))

    config = types.GenerateContentConfig(
        temperature=0.2,  # Lower for more factual responses
        max_output_tokens=8192,  # Allow longer responses
        response_mime_type="application/json",
    )

    try:
        print(f"[GROUNDED] Generating answer for: {query[:50]}...")
        print(f"[GROUNDED] Using {len(valid_docs)} PDF documents (multimodal)")

        # Send the PDFs + prompt to Gemini
        response = client.models.generate_content(
            model="gemini-2.0-flash",  # Fast multimodal model
            contents=[types.Content(role="user", parts=content_parts)],
            config=config,
        )

        response_text = response.text.strip()
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1])

        grounded_response = json.loads(response_text)

        # Build citations from the response
        citations = []
        cited_indices = grounded_response.get("cited_documents", [])
        relevance_notes = grounded_response.get("relevance_notes", {})

        for idx in cited_indices:
            if 1 <= idx <= len(valid_docs):
                doc = valid_docs[idx - 1]  # Convert to 0-indexed
                citation = {
                    "documentId": doc.get("documentId", ""),
                    "collectionId": doc.get("collectionId", ""),
                    "fileName": doc.get("fileName", ""),
                    "summary": doc.get("summary", "")[:200],  # Keep summary for display
                    "relevanceNote": relevance_notes.get(str(idx)),
                    "storagePath": doc.get("storagePath"),
                }

                # Add element-specific fields if present
                if doc.get("elementType"):
                    citation["elementId"] = doc.get("elementId")
                    citation["elementType"] = doc.get("elementType")
                    citation["elementTitle"] = doc.get("elementTitle")
                    citation["elementPageNumber"] = doc.get("elementPageNumber")

                citations.append(citation)

        answer = grounded_response.get("answer", "Unable to generate answer.")
        confidence = grounded_response.get("confidence", 0.5)

        print(f"[GROUNDED] Generated answer ({len(answer)} chars) with {len(citations)} citations, confidence: {confidence}")

        return {
            "answer": answer,
            "citations": citations,
            "confidence": confidence,
        }

    except Exception as e:
        print(f"[GROUNDED] Error generating answer: {e}")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Failed to generate grounded answer: {str(e)}",
        )
