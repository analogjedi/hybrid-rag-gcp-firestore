# Hybrid RAG for GCP Firestore

A **metadata-first agentic RAG** implementation for Firebase Firestore using Google Gemini AI. This approach solves the fundamental problem of traditional RAG systems: they fail with multimodal documents.

## Why This Approach?

### The Problem with Traditional RAG

Traditional RAG systems chunk documents into text fragments and embed each chunk. This fails badly with real-world documents:

- **Diagrams and figures** are lost entirely or reduced to meaningless captions
- **Tables** become garbled rows without headers
- **Images** (schematics, photos, charts) provide no searchable content
- **Document structure** is destroyed—chunks have no context about where they came from

### Metadata-First RAG: A Better Way

Instead of chunking, this system:

1. **Analyzes the full document** using Gemini's multimodal capabilities (sees text, images, tables, diagrams)
2. **Extracts rich metadata**: summary, chapter summaries, keywords, and schema-defined fields
3. **Extracts visual elements**: tables, figures, and images as separate searchable entities with their own metadata
4. **Embeds the metadata** (not the document chunks) for semantic search
5. **Creates element subcollections** with independent embeddings for element-level search
6. **Returns full documents** to the LLM for grounded answer generation

The LLM receives complete context—not fragments—enabling high-quality answers grounded in the actual source material. Element-level search allows finding specific tables, charts, or images within documents.

## Overview

This reference implements an **agentic retrieval pipeline** for natural language queries like:

- "FinFET process with stress engineering"
- "yield improvement for advanced nodes"
- "gate oxide reliability studies"

## How It Works

### Ingestion Pipeline

```
PDF / Audio / Video (< 2-4MB inline, or Cloud Storage link)
         │
         ▼
  Gemini Multimodal Analysis (gemini-2.5-flash)
  ├── "Sees" entire document: text, images, tables, diagrams
  └── Extracts structured metadata:
         │
         ├── summary: 2-3 sentence overview
         ├── chapters[]: section-by-section summaries
         ├── keywords[]: searchable terms
         ├── tables[]: table metadata with columns & data preview
         ├── figures[]: chart/diagram descriptions & insights
         ├── images[]: photo/illustration subjects & context
         └── schema fields: product family, category, etc.
         │
         ▼
  Metadata Text → Embedding (gemini-embedding-001, 2048 dims)
         │
         ├── Parent doc embedding (includes element summaries)
         └── Element subcollection (independent embeddings)
         │
         ▼
  Stored in Firestore with Vector Indexes
```

### Retrieval Pipeline (Agentic)

```
User Query + Conversation History
         │
         ▼
  AI Classifier (gemini-2.5-pro)
  └── Routes to relevant collection(s)
         │
         ▼
  Hybrid Search (parallel)
  ├── Document Search
  │   ├── Exact keyword matching (part numbers, SKUs)
  │   └── Semantic similarity on metadata
  └── Element Search (collection group query)
      └── Semantic similarity on tables/figures/images
         │
         ▼
  Merged & Sorted Results
  └── Documents + Elements ranked by weightedScore
         │
         ▼
  AI Reranker (optional)
  └── Reviews results, selects best documents/elements
         │
         ▼
  Full Document(s) + Query → LLM
  └── Grounded answer with element-aware citations
```

## Directory Structure

| Path | Purpose |
|------|---------|
| `README.md` | This file - overview and quick start |
| `CLAUDE.md` | AI assistant context and quick reference |
| `ARCHITECTURE.md` | Technical deep-dive on data model and design |
| `RELEVANCE_SCORING.md` | How similarity scores are calculated |
| **admin_site/** | Next.js admin application |
| ↳ `functions/main.py` | Cloud Functions (embedding, search, processing) |
| ↳ `.env.local.example` | Environment variable template |
| **python_utilities/** | Command-line tools for embedding management |
| ↳ `README.md` | Utility documentation and workflow guide |
| ↳ `reset_embeddings.py` | Clear embeddings and reset document status |
| ↳ `direct_embedding_update.py` | Generate embeddings locally via Vertex AI |
| **client_typescript/** | TypeScript/React client |
| ↳ `types.ts` | TypeScript interfaces |
| ↳ `search_client.ts` | Client wrapper with React hook example |
| **client_python/** | Python client |
| ↳ `types.py` | Python dataclasses and TypedDict definitions |
| ↳ `search_client.py` | Python client with Streamlit UI support |
| **setup/** | Setup guides |
| ↳ `vector_index.md` | gcloud commands for vector index creation |
| ↳ `iam_requirements.md` | IAM roles needed for Cloud Functions |
| **reference_documentation/** | External reference docs |

## Quick Start

### 1. Configure Environment

Copy the environment template and configure your GCP credentials:

```bash
cd admin_site
cp .env.local.example .env.local
# Edit .env.local with your project settings
```

Required variables:
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account JSON
- `FIREBASE_PROJECT_ID` - Your GCP project ID
- `FIRESTORE_DATABASE_ID` - Database ID (e.g., "test")
- `VERTEX_AI_PROJECT` - Project for Vertex AI
- `VERTEX_AI_LOCATION` - Region (e.g., "us-central1")

### 2. Deploy Cloud Functions

```bash
cd admin_site/functions
firebase deploy --only functions
```

### 3. Create Vector Indexes

**Document Index** (per collection):
```bash
gcloud firestore indexes composite create \
  --collection-group=YOUR_COLLECTION_documents \
  --query-scope=COLLECTION \
  --field-config='field-path=contentEmbedding.vector,vector-config={"dimension":"2048","flat":"{}"}' \
  --database=test \
  --project=YOUR_PROJECT_ID
```

**Element Index** (one-time, for all collections):
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

### 4. Configure IAM

See `setup/iam_requirements.md` for required service account roles.

### 5. Use in Your App

**TypeScript/React:**

```typescript
import { searchDocuments } from './search_client';

const results = await searchDocuments({
  query: "FinFET process with stress engineering",
  limit: 20,
  threshold: 0.5
});

// Results sorted by relevance
results.forEach(r => {
  console.log(`${r.relevanceScore}% - ${r.summary}`);
});
```

**Python/Streamlit:**

```python
from client_python import VectorSearchClient, StreamlitSearchUI

# Initialize client
client = VectorSearchClient(
    credentials_path="service-account.json",
    project_id="your-project"
)

# Direct search
response = client.search("FinFET process with stress engineering")
for r in response.results:
    print(f"{r.relevance_score}% - {r.summary}")

# Or use the Streamlit UI component
ui = StreamlitSearchUI(client)
ui.render()
```

## Example Use Case

This reference uses a semiconductor documentation example:

| Document Type | Example Content |
|---------------|-----------------|
| IC Design Spec | "28nm SRAM cell design with 6T architecture" |
| Process Flow | "HKMG gate-first integration flow" |
| Characterization Report | "Vt distribution analysis for NMOS devices" |
| Failure Analysis | "ESD damage root cause investigation" |

## Key Technologies

| Technology | Purpose |
|------------|---------|
| Firebase Firestore | Document database with vector search |
| Gemini 3 Pro/Flash | Query classification and document analysis (`gemini-2.5-pro`, `gemini-2.5-flash`) |
| Gemini Embeddings | Semantic embeddings (`gemini-embedding-001`, 2048 dims) |
| Firebase Cloud Functions | Serverless compute (Python) |
| Next.js / React | Admin site and web client |
| Python/Streamlit | Python client and dashboard UI |

## Supported Content Types

| Type | Storage | Notes |
|------|---------|-------|
| PDF (small) | Firestore binary field | Direct storage for quick access |
| PDF (large) | Cloud Storage + pointer | Reference stored in Firestore document |
| PDF (very large) | Chapter segmentation | Agentic splitting creates per-chapter entries with individual metadata |
| Audio | Future | Extensible architecture |
| Video | Future | Extensible architecture |

### Large Document Handling

For very large documents (100+ pages), the system supports **agentic chapter segmentation**:
- Each chapter becomes its own Firestore document with rich metadata
- Chapter PDFs can be stored inline (small) or in Cloud Storage (large)
- Search can return specific chapters, not just whole documents
- LLM receives only the relevant chapter(s) for focused context

## Cost Considerations

| Resource | Cost |
|----------|------|
| Vertex AI Embeddings | ~$0.00002 per 1K characters |
| Vertex AI Gemini | ~$0.00025 per 1K input tokens |
| Firestore writes | ~$0.18 per 100K writes |
| Function invocations | ~$0.0000004 per invocation |
| Vector index storage | Included in Firestore storage |

## Documentation

For detailed information, see:

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Quick reference for AI assistants and developers |
| `ARCHITECTURE.md` | Data model, embedding patterns, technical deep-dive |
| `RELEVANCE_SCORING.md` | DOT_PRODUCT similarity to percentage conversion |
| `setup/vector_index.md` | Vector index creation and management |
| `setup/iam_requirements.md` | IAM roles for Cloud Functions |
| `python_utilities/README.md` | CLI tools for embedding management |
| `admin_site/docs/GOOGLE_CLOUD_SETUP.md` | Complete GCP setup guide |

## Further Reading

- [Firebase Vector Search Documentation](https://firebase.google.com/docs/firestore/vector-search)
- [Vertex AI Text Embeddings](https://cloud.google.com/vertex-ai/docs/generative-ai/embeddings/get-text-embeddings)
- [Firestore Cloud Functions](https://firebase.google.com/docs/functions/firestore-events)
