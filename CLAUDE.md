# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A reference implementation for semantic search in Firebase Firestore using vector embeddings and Google Gemini AI. The system automatically generates 768-dimensional embeddings for document content and enables natural language similarity search.

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

- **Embedding Model**: `text-embedding-005` via Vertex AI (768 dimensions)
- **Gemini Model**: `gemini-2.0-flash-001` via Vertex AI (document analysis, query classification)
- **Distance Measure**: COSINE (0.0 = identical, 2.0 = opposite)
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
  --collection-group=documents \
  --query-scope=COLLECTION_GROUP \
  --field-config=field-path=contentEmbedding.vector,vector-config='{"dimension":"768","flat":"{}"}' \
  --database="(default)" \
  --project=YOUR_PROJECT_ID
```

## Document Data Model

Documents follow this structure:
```
{collection}/{documentId}
├── content: {
│   ├── summary: string
│   ├── details: string
│   └── contentUpdatedAt: ISO timestamp
│   }
└── contentEmbedding: {
    ├── vector: Vector(768 floats)
    ├── embeddedAt: ISO timestamp
    └── modelVersion: "text-embedding-005"
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
