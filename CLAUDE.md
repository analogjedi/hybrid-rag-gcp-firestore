# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A **metadata-first agentic RAG** system for Firebase Firestore using Google Gemini AI. Unlike traditional RAG that chunks documents into text fragments, this system extracts rich metadata from full documents using Gemini's multimodal capabilities, then performs hybrid search on that metadata.

## Architecture Philosophy

### Why Metadata-First?

Traditional RAG fails with multimodal documents:
- Text chunking destroys diagrams, tables, and images
- Chunks lose document structure and context
- Semantic search on fragments returns incomplete results

This system instead:
1. **Gemini analyzes the full document** (PDF, audio, video) including all visual content
2. **Extracts structured metadata**: summary, chapter summaries, keywords, schema fields
3. **Extracts visual elements**: tables, figures, and images as separate searchable entities
4. **Embeds the metadata** (not chunks) for semantic search
5. **Creates element subcollections** with independent embeddings for granular search
6. **Returns full documents** to the LLM for grounded answers

### Agentic Retrieval Pipeline

```
Query → AI Classifier → Collection Selection
     → Hybrid Search (keyword + semantic) on metadata
     → Element Search (parallel) on tables/figures/images
     → AI Reranker → Select best documents + elements
     → Full Document(s) + Query → LLM → Grounded Answer
```

### Supported Content

- **PDF (small)**: Stored as binary directly in Firestore document
- **PDF (large)**: Stored in Cloud Storage with pointer reference in Firestore
- **PDF (very large)**: Agentic chapter segmentation—each chapter becomes its own Firestore entry with individual metadata and embedding
- **Audio/Video**: Extensible architecture (future)
- **Agentic endpoints**: Custom handlers for specialized content types

## Architecture

The project has four main components:

1. **Cloud Functions (Python)** - `admin_site/functions/`
   - `main.py`: All deployed Cloud Functions including:
     - `process_document`: Gemini multimodal PDF analysis (extracts tables/figures/images)
     - `generate_document_embedding`: Single document embedding generation
     - `generate_element_embeddings_for_document`: Element embeddings for subcollection
     - `generate_all_element_embeddings`: Batch element embedding generation
     - `classify_and_search`: Agentic query classification + vector search (includes elements)
     - `generate_grounded_answer`: LLM response with element-aware citations
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
- **Classification Model**: `gemini-3-pro-preview` or `gemini-3-flash-preview` via `google-genai` SDK
- **Document Analysis**: `gemini-3-flash-preview` via Vertex AI (multimodal PDF/image analysis)
- **Distance Measure**: DOT_PRODUCT (higher = more similar, normalized vectors)
- **Search Task Type**: `RETRIEVAL_QUERY` for queries, `RETRIEVAL_DOCUMENT` for corpus
- **Authentication**:
  - Embeddings & Document Analysis: Vertex AI with Application Default Credentials (ADC)
  - Gemini 3 Classification: API key via Firebase Secrets (`GEMINI_API_KEY`)

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

**IMPORTANT:** Always deploy Cloud Functions after modifying `admin_site/functions/main.py`. The admin site calls these functions via HTTP, so changes won't take effect until deployed.

### Vector Index Creation

**Document Index** (per collection):
```bash
gcloud firestore indexes composite create \
  --collection-group=YOUR_COLLECTION_documents \
  --query-scope=COLLECTION \
  --field-config='field-path=contentEmbedding.vector,vector-config={"dimension":"2048","flat":"{}"}' \
  --database=test \
  --project=YOUR_PROJECT_ID
```

**Element Index** (collection group for all elements):
```bash
gcloud firestore indexes composite create \
  --collection-group=elements \
  --query-scope=COLLECTION_GROUP \
  --field-config='field-path=collectionId,order=ASCENDING' \
  --field-config='field-path=status,order=ASCENDING' \
  --field-config='field-path=contentEmbedding.vector,vector-config={"dimension":"2048","flat":"{}"}' \
  --database=test \
  --project=YOUR_PROJECT_ID
```

## Document Data Model

### Parent Document Structure
```
{collection}_documents/{documentId}
├── content: {
│   ├── summary: string
│   ├── keywords: string[]
│   ├── chapters: ChapterMetadata[]
│   ├── tables: ExtractedTable[]      # NEW: Table metadata
│   ├── figures: ExtractedFigure[]    # NEW: Figure metadata
│   ├── images: ExtractedImage[]      # NEW: Image metadata
│   ├── elementCounts: { tables, figures, images }
│   └── contentUpdatedAt: ISO timestamp
│   }
└── contentEmbedding: {
    ├── vector: Vector(2048 floats)   # Includes element summaries
    ├── embeddedAt: ISO timestamp
    └── modelVersion: "gemini-embedding-001"
    }
```

### Element Subcollection Structure
```
{collection}_documents/{documentId}/elements/{elementId}
├── parentDocumentId: string
├── collectionId: string
├── elementType: "table" | "figure" | "image"
├── element: ExtractedTable | ExtractedFigure | ExtractedImage
├── parentFileName: string           # Denormalized for display
├── parentStoragePath: string        # Denormalized for grounding
├── contentEmbedding: Vector(2048)   # Independent embedding
└── status: "pending" | "ready"
```

### Element Types
- **ExtractedTable**: title, description, columnHeaders, rowCount, dataPreview
- **ExtractedFigure**: title, description, figureType (chart/diagram/graph/schematic), visualElements, dataInsights
- **ExtractedImage**: title, description, imageType (photo/screenshot/logo/illustration), subjects, context

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

**Embeddings & Document Processing:** Use Application Default Credentials (ADC) - no API keys needed.

**Gemini 3 Classification (google-genai SDK):** Requires API key stored in Firebase Secrets.

#### Setting up Gemini 3 API Key

1. **Generate API Key** in [Google AI Studio](https://aistudio.google.com/apikey) or Vertex AI Studio
2. **Store as Firebase Secret:**
   ```bash
   firebase functions:secrets:set GEMINI_API_KEY --project YOUR_PROJECT_ID
   # Paste your API key when prompted
   ```
3. **Verify secret access:**
   ```bash
   firebase functions:secrets:access GEMINI_API_KEY --project YOUR_PROJECT_ID
   ```

The Cloud Function declares the secret dependency:
```python
@https_fn.on_call(
    secrets=["GEMINI_API_KEY"],
)
def classify_and_search(req):
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(vertexai=True, api_key=api_key)
```

#### Python Dependencies for Gemini 3

The `google-genai` SDK is required for Gemini 3 models:
```
# requirements.txt
google-genai>=1.0.0
```

Usage:
```python
from google import genai
from google.genai import types

client = genai.Client(vertexai=True, api_key=os.environ.get("GEMINI_API_KEY"))

config = types.GenerateContentConfig(
    temperature=0.1,
    max_output_tokens=8192,
    response_mime_type="application/json",
    thinking_config=types.ThinkingConfig(thinking_level="HIGH"),  # or "LOW"
)

response = client.models.generate_content(
    model="gemini-3-pro-preview",  # or "gemini-3-flash-preview"
    contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
    config=config,
)
```

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
