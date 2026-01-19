# Document Search Admin Site

Enterprise document management with AI-powered semantic search using Firestore Vector Search and Vertex AI Gemini.

## Features

- **Schema-Driven Collections**: Define document collections with YAML schemas
- **AI Metadata Extraction**: Gemini 2.0 Flash analyzes PDFs and extracts structured metadata
- **Auto-Generated Embeddings**: Vector embeddings for semantic search
- **Agentic Query Routing**: AI classifies queries to search the right collection(s)
- **Multi-Collection Search**: Unified search results across multiple collections

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ADMIN SITE (Next.js 15)                       │
│  Dashboard │ Collections │ Upload │ Documents │ Search              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     CLOUD FUNCTIONS (Python)                         │
│  process_document │ generate_embeddings │ classify_and_search       │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          FIRESTORE                                   │
│  _system/config/schemas/* │ {collection}/documents/*                │
│                      (with vector indexes)                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Document Processing Pipeline

1. **Upload**: PDF stored in Cloud Storage, document record created in Firestore (status: `pending`)
2. **Process**: Click "Process" in UI to trigger Gemini multimodal analysis
3. **Extract**: Metadata fields extracted based on collection schema (status: `metadata_ready`)
4. **Embed**: Generate 2048-dim vector embedding via Cloud Function (status: `ready`)
5. **Search**: Document now searchable via vector similarity with relevance scores

## Pre-defined Collections

| Collection ID | Description |
|---------------|-------------|
| `human_resources_all` | HR policies, benefits, org charts |
| `ic_process_engineering` | Fab process flows, yield reports |
| `ic_design_engineering` | Circuit designs, layout rules |
| `products_and_datasheets` | Product specs, datasheets |
| `etq_specifications` | Quality specs, test procedures |
| `functional_safety` | ISO 26262, FMEA, safety analysis |

## Setup

### Prerequisites

- Node.js 20+
- Python 3.11+
- Google Cloud project with:
  - Firestore (Native mode)
  - Cloud Storage
  - Vertex AI API enabled

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.local.example` to `.env.local` and fill in:

```bash
# Vertex AI (Gemini)
VERTEX_AI_PROJECT=your-project-id
VERTEX_AI_LOCATION=us-central1

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### 3. Deploy Cloud Functions

```bash
cd functions
pip install -r requirements.txt
firebase deploy --only functions
```

### 4. Vector Indexes (Auto-Created)

Vector indexes are **automatically created** when you create a new collection via the UI.
The `create_vector_index` Cloud Function handles this automatically.

For manual index management, use the Python utilities:

```bash
cd admin_site/functions
./venv/bin/python ../python_utilities/manage_indexes.py list    # Check index status
./venv/bin/python ../python_utilities/manage_indexes.py create <collection_id>  # Manual create
```

### 5. Initialize Schema Collections

The schemas in `/schemas/*.yaml` need to be loaded into Firestore. You can do this:

1. Via the admin site UI (Collections → New Collection)
2. Programmatically using the `/api/collections` endpoint

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Backend**: Firebase Admin SDK
- **AI**: Vertex AI (Gemini 2.0 Flash, gemini-embedding-001)
- **Database**: Firestore with Vector Search
- **Storage**: Cloud Storage

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/collections` | GET | List all collections |
| `/api/collections` | POST | Create collection (from schema) |
| `/api/collections/[id]` | GET/PUT/DELETE | Collection CRUD |
| `/api/documents` | GET | List documents in collection |
| `/api/documents/[id]` | GET/PUT/DELETE | Document CRUD |
| `/api/upload` | POST | Upload file to collection |
| `/api/process` | POST | Trigger document processing |
| `/api/search` | POST | Agentic search via Cloud Function |

## Cloud Functions

All functions are HTTP-callable (triggers don't work with non-default Firestore databases in Enterprise mode).

| Function | Description |
|----------|-------------|
| `process_document` | Gemini PDF analysis for a single document |
| `process_pending_documents` | Batch process all pending documents |
| `generate_document_embedding` | Generate embedding for one document |
| `generate_embeddings_for_ready_docs` | Batch generate embeddings |
| `classify_and_search` | Agentic query routing + vector search |
| `get_all_collection_stats` | Dashboard statistics |
| `backfill_embeddings` | Backfill missing embeddings |
| `create_vector_index` | Auto-create vector index for new collections |

## Search Flow

1. **Query Classification**: Gemini analyzes the query and routes it to the most relevant collection(s)
2. **Embedding**: Query is converted to a 2048-dimension vector using `gemini-embedding-001` with `RETRIEVAL_QUERY` task type
3. **Vector Search**: Firestore `find_nearest()` with DOT_PRODUCT finds documents with similar embeddings
4. **Relevance Scoring**: Results include similarity score (higher = more similar) converted to % relevance

### Search Response

```json
{
  "results": [{
    "documentId": "abc123",
    "fileName": "ACS37630-Datasheet.pdf",
    "summary": "Hall-effect sensor for current sensing...",
    "keywords": ["current sensor", "hall effect", ...],
    "rawDistance": 0.319,
    "weightedScore": 0.84
  }],
  "classification": {
    "primary_collection": "products_and_datasheets",
    "primary_confidence": 0.9,
    "reasoning": "Query relates to product specifications..."
  },
  "searchMetadata": {
    "collectionsSearched": ["products_and_datasheets"],
    "totalCandidates": 2,
    "searchTimeMs": 1059
  }
}
```

## Schema Format

See `/schemas/*.yaml` for examples. Key sections:

```yaml
collection:
  id: my_collection
  display_name: "My Collection"
  description: "..."
  icon: "file-text"  # Lucide icon

fields:
  - name: summary
    type: string
    source: gemini  # or "manual"
    prompt: "..."   # For gemini fields

embedding:
  model: gemini-embedding-001
  dimensions: 2048
  text_template: "{summary}\n\nKeywords: {keywords}"

classifier_hints:
  keywords: ["term1", "term2"]
  example_queries: ["Example query 1", "Example query 2"]
```

## License

MIT
