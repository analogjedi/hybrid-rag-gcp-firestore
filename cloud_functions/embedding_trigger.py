"""
Firestore Trigger for Automatic Embedding Generation

This module implements a Firestore trigger that automatically generates
vector embeddings when document content is created or updated.

Example Use Case:
    An enterprise semiconductor company storing IC design documentation.
    When a new design spec is uploaded, the trigger automatically generates
    a 768-dimensional embedding for semantic search.

Usage:
    Deploy with Firebase Functions:
    $ firebase deploy --only functions:on_content_write
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from typing import Any

from firebase_admin import initialize_app, firestore
from firebase_functions import firestore_fn, options
from google.cloud.firestore_v1.vector import Vector


# Initialize Firebase Admin SDK
initialize_app()
db = firestore.client()


@firestore_fn.on_document_written(
    document="{collection}/{documentId}",  # Adjust to your collection path
    timeout_sec=60,
    memory=options.MemoryOption.MB_512,
    secrets=["GEMINI_API_KEY"],
)
def on_content_write(
    event: firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot]]
) -> None:
    """
    Firestore trigger that generates vector embeddings when content is written.

    This function:
    1. Detects when content is added or updated on a document
    2. Generates a 768-dimensional embedding using Gemini's embedding model
    3. Stores the embedding in contentEmbedding field for vector search

    The embedding is created from combined summary + details text.

    Args:
        event: Firestore event containing before/after document snapshots.

    Returns:
        None. Updates the document with the embedding field.

    Raises:
        Does not raise exceptions - embedding generation is non-critical.
        Errors are logged but do not prevent the original write.
    """
    print("DEBUG embedding: ===== TRIGGER FIRED =====", file=sys.stderr)

    try:
        # Extract before/after data
        before_data = _get_document_data(event.data.before)
        after_data = _get_document_data(event.data.after)

        # Get content from after (current state)
        content = after_data.get("content")

        # Exit early if no content exists
        if not content:
            print("DEBUG embedding: No content field, skipping", file=sys.stderr)
            return

        # Get the content updated timestamp
        content_updated_at = content.get("contentUpdatedAt", "")
        if not content_updated_at:
            print("DEBUG embedding: No contentUpdatedAt timestamp, skipping", file=sys.stderr)
            return

        # Check if embedding already exists and is up-to-date (prevents infinite loop)
        existing_embedding = after_data.get("contentEmbedding")
        if existing_embedding:
            embedded_at = existing_embedding.get("embeddedAt", "")
            if embedded_at >= content_updated_at:
                print(
                    f"DEBUG embedding: Embedding already current "
                    f"(embeddedAt={embedded_at} >= contentUpdatedAt={content_updated_at}), skipping",
                    file=sys.stderr
                )
                return

        # Check if content actually changed (optimization)
        before_content = before_data.get("content", {})
        before_updated_at = before_content.get("contentUpdatedAt", "") if before_content else ""
        if before_updated_at == content_updated_at:
            print("DEBUG embedding: Content unchanged (same contentUpdatedAt), skipping", file=sys.stderr)
            return

        # Extract text to embed
        summary = content.get("summary", "")
        details = content.get("details", "")

        if not summary and not details:
            print("DEBUG embedding: Empty content text, skipping", file=sys.stderr)
            return

        # Combine text for embedding (summary provides context, details provides depth)
        text_to_embed = f"{summary}\n\n{details}".strip()
        print(f"DEBUG embedding: Embedding text length: {len(text_to_embed)} chars", file=sys.stderr)

        # Generate embedding
        embedding_values = _generate_embedding(text_to_embed)
        if embedding_values is None:
            return

        print(f"DEBUG embedding: Generated embedding with {len(embedding_values)} dimensions", file=sys.stderr)

        # Store embedding in the document
        embedded_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        event.data.after.reference.update({
            "contentEmbedding": {
                "vector": Vector(embedding_values),
                "embeddedAt": embedded_at,
                "modelVersion": "gemini-embedding-001",
            }
        })

        print(f"DEBUG embedding: Successfully stored embedding at {embedded_at}", file=sys.stderr)

    except Exception as e:
        # Log error but don't fail - embedding is non-critical
        # The original document write still succeeds even if embedding fails
        print(f"DEBUG embedding: ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        import traceback
        print(f"DEBUG embedding: TRACEBACK: {traceback.format_exc()}", file=sys.stderr)


def _get_document_data(snapshot: firestore_fn.DocumentSnapshot | None) -> dict[str, Any]:
    """
    Safely extract data from a Firestore document snapshot.

    Args:
        snapshot: Firestore document snapshot, may be None.

    Returns:
        Document data as a dictionary, or empty dict if snapshot is None/doesn't exist.
    """
    if snapshot and snapshot.exists:
        return snapshot.to_dict() or {}
    return {}


def _generate_embedding(text: str) -> list[float] | None:
    """
    Generate a 768-dimensional embedding using Gemini.

    Args:
        text: The text content to embed.

    Returns:
        List of 768 floats representing the embedding, or None if generation fails.
    """
    from google import genai
    from google.genai import types

    gemini_api_key = os.environ.get('GEMINI_API_KEY')
    if not gemini_api_key:
        print("DEBUG embedding: GEMINI_API_KEY not configured, skipping", file=sys.stderr)
        return None

    client = genai.Client(api_key=gemini_api_key)

    print("DEBUG embedding: Generating embedding with gemini-embedding-001...", file=sys.stderr)
    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=768),
    )

    return response.embeddings[0].values
