# Firestore Vector Embeddings Reference

A complete reference implementation for semantic search in Firebase Firestore using vector embeddings and Google Gemini AI.

## Overview

This reference demonstrates how to implement automatic vector embedding generation and similarity search for document content in Firestore. The pattern enables natural language queries like:

- "FinFET process with stress engineering"
- "yield improvement for advanced nodes"
- "gate oxide reliability studies"

## How It Works

```
Document Created/Updated
         │
         ▼
  Content field written (e.g., summary + details)
         │
         ▼
  Firestore Trigger fires automatically
         │
         ▼
  on_content_write trigger
         │
         ├── Detects new/updated content
         │   (compares contentUpdatedAt timestamps)
         │
         ├── Generates 768-dim embedding
         │   (Vertex AI text-embedding-005)
         │
         └── Stores contentEmbedding field
                {
                  vector: [0.123, -0.456, ...],
                  embeddedAt: ISO timestamp,
                  modelVersion: "text-embedding-005"
                }
                │
                ▼
            Vector Index Updated
                │
                ▼
        User searches with natural language
        (e.g., "metal fill optimization techniques")
                │
                ▼
    vector_search Cloud Function
                │
                ├── Generate query embedding
                ├── Call Firestore find_nearest()
                │   (COSINE distance measure)
                │
                ├── Calculate relevance scores
                │   (distance / 0.4 baseline)
                │
                └── Return ranked results
                    {
                      documentId, distance,
                      relevanceScore, summary
                    }
                    │
                    ▼
            Display in UI
            (sorted by relevance)
```

## Directory Structure

| File | Purpose |
|------|---------|
| `README.md` | This file - overview and quick start |
| `ARCHITECTURE.md` | Technical deep-dive on data model and design |
| `RELEVANCE_SCORING.md` | How distance is converted to relevance % |
| **admin_site/** | Next.js admin application |
| `functions/main.py` | Cloud Functions (embedding, search, processing) |
| `.env.local.example` | Environment variable template |
| **client_typescript/** | |
| `types.ts` | TypeScript interfaces |
| `search_client.ts` | Client wrapper with React hook example |
| **client_python/** | |
| `types.py` | Python dataclasses and TypedDict definitions |
| `search_client.py` | Python client with Streamlit UI support |
| **setup/** | |
| `vector_index.md` | gcloud commands for vector index creation |
| `iam_requirements.md` | IAM roles needed for Cloud Functions |

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

### 3. Create Vector Index

```bash
gcloud firestore indexes composite create \
  --collection-group=documents \
  --query-scope=COLLECTION_GROUP \
  --field-config=field-path=contentEmbedding.vector,vector-config='{"dimension":"768","flat":"{}"}' \
  --database="(default)" \
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
| Vertex AI | Embedding model (`text-embedding-005`) and Gemini (`gemini-2.0-flash-001`) |
| Firebase Cloud Functions | Serverless compute (Python) |
| Next.js / React | Admin site and web client |
| Python/Streamlit | Python client and dashboard UI |

## Cost Considerations

| Resource | Cost |
|----------|------|
| Vertex AI Embeddings | ~$0.00002 per 1K characters |
| Vertex AI Gemini | ~$0.00025 per 1K input tokens |
| Firestore writes | ~$0.18 per 100K writes |
| Function invocations | ~$0.0000004 per invocation |
| Vector index storage | Included in Firestore storage |

## Further Reading

- [Firebase Vector Search Documentation](https://firebase.google.com/docs/firestore/vector-search)
- [Vertex AI Text Embeddings](https://cloud.google.com/vertex-ai/docs/generative-ai/embeddings/get-text-embeddings)
- [Firestore Cloud Functions](https://firebase.google.com/docs/functions/firestore-events)
