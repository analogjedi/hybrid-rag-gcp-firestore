"""
Common Configuration and Shared Utilities

Shared initialization and configuration for all Cloud Function modules:
- Firebase Admin initialization
- Vertex AI initialization
- Model constants
- Database access
"""

import os

import vertexai
from firebase_admin import firestore, initialize_app

# Initialize Firebase Admin
initialize_app()

# Initialize Vertex AI
PROJECT_ID = os.environ.get("VERTEX_AI_PROJECT", os.environ.get("GCLOUD_PROJECT"))
LOCATION = os.environ.get("VERTEX_AI_LOCATION", "us-central1")
vertexai.init(project=PROJECT_ID, location=LOCATION)

# Database ID (non-default)
DATABASE_ID = os.environ.get("FIRESTORE_DATABASE_ID", "test")

# Models
# Note: gemini-2.5-flash is GA and stable; gemini-3-flash is preview
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
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
