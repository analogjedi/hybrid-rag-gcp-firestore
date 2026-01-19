# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A reference implementation for semantic search in Firebase Firestore using vector embeddings and Google Gemini AI. The system automatically generates 2048-dimensional embeddings for document content and enables natural language similarity search.

## Architecture

The project has four main components:

1. **Cloud Functions (Python)** - `admin_site/functions/`
   - `main.py`: All deployed Cloud Functions including:
     - `process_document`: Gemini multimodal PDF analysis
     - `generate_document_embedding`: Single document embedding generation
     - `classify_and_search`: Agentic query classification + vector search
     - `backfill_embeddings`: Batch processing for existing documents

2. **Admin Site (Next.js)** - `admin_site/`
   - Next.js 15 with React 19 and TypeScript
   - UI for managing collections, documents, schemas, and search
   - Uses Radix UI components and Tailwind CSS 4

3. **TypeScript Client** - `client_typescript/`
   - Client wrapper for calling vector search from web apps

4. **Python Client** - `client_python/`
   - Python client with Streamlit UI support

## Key Technical Details

- **Embedding Model**: `gemini-embedding-001` via Vertex AI (2048 dimensions)
- **Gemini Model**: `gemini-2.0-flash-001` via Vertex AI (document analysis, query classification)
- **Distance Measure**: DOT_PRODUCT (higher = more similar, normalized vectors)
- **Search Task Type**: `RETRIEVAL_QUERY` for queries, `RETRIEVAL_DOCUMENT` for corpus
- **Authentication**: Vertex AI with Application Default Credentials (no API keys needed)

## Build & Development Commands

### Admin Site
```bash
cd admin_site
npm install
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # Run ESLint
```

### Cloud Functions
```bash
cd admin_site/functions
firebase deploy --only functions              # Deploy all functions
```

### Vector Index Creation
```bash
gcloud firestore indexes composite create \
  --collection-group=YOUR_COLLECTION_documents \
  --query-scope=COLLECTION \
  --field-config='field-path=contentEmbedding.vector,vector-config={"dimension":"2048","flat":"{}"}' \
  --database=test \
  --project=YOUR_PROJECT_ID
```

## Document Data Model

Documents follow this structure:
```
{collection}/{documentId}
├── content: {
│   ├── summary: string
│   ├── details: string
│   ├── keywords: string[]
│   └── contentUpdatedAt: ISO timestamp
│   }
└── contentEmbedding: {
    ├── vector: Vector(2048 floats)
    ├── embeddedAt: ISO timestamp
    └── modelVersion: "gemini-embedding-001"
    }
```

## Environment Configuration

### Admin Site (local development)
Copy `admin_site/.env.local.example` to `admin_site/.env.local` and configure:

| Variable | Description |
|----------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON |
| `FIREBASE_PROJECT_ID` | GCP project ID |
| `FIRESTORE_DATABASE_ID` | Database ID (e.g., "test" or "(default)") |
| `FIREBASE_STORAGE_BUCKET` | Cloud Storage bucket name |
| `VERTEX_AI_PROJECT` | Project for Vertex AI (usually same as Firebase) |
| `VERTEX_AI_LOCATION` | Vertex AI region (e.g., "us-central1") |

### Cloud Functions (deployed)
No API keys or secrets required. Cloud Functions authenticate via Application Default Credentials (ADC) which automatically use the function's service account within GCP.

## Python Utilities

Located in `python_utilities/` - command-line tools for managing embeddings.

### Setup
```bash
cd python_utilities
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Authentication:** Uses service account JSON file at project root (`service-account.json`).

### Available Scripts

| Script | Purpose |
|--------|---------|
| `reset_embeddings.py` | Clear embeddings and reset status to `metadata_ready` |
| `direct_embedding_update.py` | Generate embeddings locally using Vertex AI |
| `regenerate_embeddings.py` | Trigger Cloud Function for embedding generation |

### Embedding Upgrade Workflow
```bash
# 1. Reset existing embeddings
python reset_embeddings.py --execute

# 2. Delete old vector indexes (via gcloud)
# 3. Generate new embeddings
python direct_embedding_update.py

# 4. Create new vector indexes (via gcloud)
```

See `python_utilities/README.md` for detailed instructions.

## Documentation Index

| Document | Purpose |
|----------|---------|
| **This file (CLAUDE.md)** | Quick reference for AI assistants and developers |
| `README.md` | Project overview, quick start guide |
| `ARCHITECTURE.md` | Data model, embedding patterns, technical deep-dive |
| `RELEVANCE_SCORING.md` | DOT_PRODUCT similarity to percentage conversion |
| `setup/vector_index.md` | Vector index creation and management |
| `setup/iam_requirements.md` | IAM roles for Cloud Functions |
| `python_utilities/README.md` | CLI tools for embedding management |
| `admin_site/README.md` | Admin site features and API routes |
| `admin_site/docs/GOOGLE_CLOUD_SETUP.md` | Complete GCP setup guide |
| `reference_documentation/` | External reference docs from Google |
