# Vector Embeddings Architecture

This document provides technical details on implementing vector embeddings in Firestore.

## Data Model

### Document Structure

Documents that need semantic search should include a `content` field (or similar) that contains the text to be embedded, plus a `contentEmbedding` field that stores the vector:

```
{collection}_documents/{documentId}
├── content: {
│   ├── summary: "7nm FinFET process flow with stress engineering"
│   ├── keywords: ["FinFET", "stress engineering", ...]
│   ├── chapters: [{title, summary, pageStart, pageEnd, level, order}, ...]
│   ├── tables: [{id, title, description, columnHeaders, rowCount, dataPreview}, ...]
│   ├── figures: [{id, title, description, figureType, visualElements, dataInsights}, ...]
│   ├── images: [{id, title, description, imageType, subjects, context}, ...]
│   ├── elementCounts: {tables: 3, figures: 5, images: 2}
│   ├── contentUpdatedAt: "2026-01-03T14:30:00Z"
│   └── ...other schema fields
│   }
└── contentEmbedding: {
    ├── vector: Vector([0.123, -0.456, ...])  ← 2048 floats (includes element summaries)
    ├── embeddedAt: "2026-01-03T14:30:05Z"
    └── modelVersion: "gemini-embedding-001"
    }
```

### Element Subcollection Structure

Each extracted table, figure, or image gets its own document in an `elements` subcollection with an independent embedding for granular search:

```
{collection}_documents/{documentId}/elements/{elementId}
├── parentDocumentId: "abc123"
├── collectionId: "products_and_datasheets"
├── elementType: "table" | "figure" | "image"
├── element: {
│   ├── id: "table_1"
│   ├── type: "table"
│   ├── title: "Electrical Specifications"
│   ├── description: "Operating voltage and current limits"
│   ├── pageNumber: 5
│   ├── order: 0
│   ├── columnHeaders: ["Parameter", "Min", "Typ", "Max", "Unit"]
│   ├── rowCount: 12
│   └── dataPreview: "VCC | 4.5 | 5.0 | 5.5 | V; ICC | - | 10 | 15 | mA"
│   }
├── parentFileName: "ACS37630-Datasheet.pdf"
├── parentStoragePath: "gs://bucket/documents/..."
├── contentEmbedding: {
│   ├── vector: Vector([...])  ← Independent 2048-dim embedding
│   ├── embeddedAt: "2026-01-03T14:30:10Z"
│   └── modelVersion: "gemini-embedding-001"
│   }
├── status: "pending" | "ready" | "error"
└── createdAt: "2026-01-03T14:30:00Z"
```

### Why Hybrid Architecture?

The hybrid approach (summaries in parent + independent element embeddings) enables:

1. **Document-level search**: Parent embedding includes element summaries, so searching for "voltage specifications" finds documents with relevant tables
2. **Element-level search**: Independent embeddings allow finding specific tables/figures across all documents
3. **Grounded answers**: Element citations can reference specific tables/figures with page numbers
4. **Flexible retrieval**: Return whole documents or specific elements based on query intent

### ContentEmbedding Interface

```typescript
interface ContentEmbedding {
  vector: number[];        // 2048-dimensional embedding (Firestore Vector type)
  embeddedAt: string;      // ISO timestamp (e.g., "2026-01-04T00:00:00.560010Z")
  modelVersion: string;    // "gemini-embedding-001"
}
```

### Why Store Metadata?

- **embeddedAt**: Enables infinite loop prevention (if `embeddedAt >= contentUpdatedAt`, skip)
- **modelVersion**: Tracks which model generated the embedding (useful for migrations)

---

## Element Extraction

### Extracted Element Types

| Type | Fields | Use Case |
|------|--------|----------|
| **Table** | title, description, columnHeaders, rowCount, dataPreview | Specifications, comparisons, data tables |
| **Figure** | title, description, figureType, visualElements, dataInsights | Charts, diagrams, schematics, graphs |
| **Image** | title, description, imageType, subjects, context | Photos, screenshots, illustrations |

### Element Embedding Text

Element embeddings are generated from structured fields:

**Table**: `{title}\n{description}\nColumns: {columnHeaders}\nData: {dataPreview}`

**Figure**: `{title}\n{description}\nType: {figureType}\nVisual elements: {visualElements}\nInsights: {dataInsights}`

**Image**: `{title}\n{description}\nType: {imageType}\nSubjects: {subjects}\nContext: {context}`

### Element Search

Elements are searched using a **collection group query** that spans all `elements` subcollections:

```python
db.collection_group("elements")
  .where("collectionId", "==", collection_id)
  .where("status", "==", "ready")
  .find_nearest(
      vector_field="contentEmbedding.vector",
      query_vector=query_embedding,
      distance_measure=DistanceMeasure.DOT_PRODUCT,
      limit=limit
  )
```

Element results are merged with document results and sorted by `weightedScore`.

---

## Grounded Answer Generation

The Chat feature generates grounded answers using Gemini multimodal with the actual PDF documents.

### Flow

```
User Query → classify_and_search (find relevant docs with chapters/figures metadata)
          → generate_grounded_answer (load actual PDFs + metadata structure)
          → Gemini reads full PDF + uses metadata as "table of contents"
          → Returns answer with granular citations
```

### Granular Citations

The grounding prompt includes document structure (chapters, figures, tables) to enable section-level citations:

```
[Doc 1]: Employee_Handbook.pdf
  Table of Contents:
    - "Part 1: Welcome" (pp. 6-7)
    - "Part 2: Settling In" (pp. 9-20)
    - "Part 3: How Am I Doing?" (pp. 22-25)
  Figures (16 total):
    - Fig. 1-1 (illustration, p. 6)
    - Fig. 2-1 (illustration, p. 12)
    ...
```

Gemini then cites specific sections in its answer:

> "Valve employees start new projects by identifying opportunities [Doc 1, "Part 2: Settling In", pp. 9-10]. Figure 3-1 illustrates the method to working without a boss [Doc 1, Fig. 3-1, p. 23]."

### Citation Formats

| Citation Type | Format | Example |
|---------------|--------|---------|
| Chapter/Section | `[Doc N, "Title", pp. X-Y]` | `[Doc 1, "Part 2: Settling In", pp. 9-20]` |
| Figure | `[Doc N, Fig. X-Y, p. Z]` | `[Doc 1, Fig. 3-1, p. 23]` |
| Table | `[Doc N, Table X, p. Y]` | `[Doc 1, Table 2, p. 15]` |
| General | `[Doc N]` | `[Doc 1]` |

### Key Points

- **Full PDF is sent to Gemini**: The actual PDF file is loaded from Cloud Storage and sent as multimodal content
- **Metadata provides structure**: Chapter/figure metadata from Firestore gives Gemini a "map" of the document
- **Model does the reading**: Gemini reads the full PDF content to generate accurate answers
- **Rich citations**: Answers reference specific sections, figures, and page numbers

---

## Classifier Keyword Aggregation

The AI classifier routes queries to relevant collections based on collection metadata. To improve routing accuracy, document keywords are automatically aggregated to the collection schema.

### Why Keyword Aggregation?

Collection descriptions alone may not capture all the specific terms that appear in documents. For example:
- A query "In the Valve handbook, what game did they release in 2007?"
- The HR collection description says "Employee handbooks and HR policies"
- Without keyword aggregation, the classifier might route to "Products" because "game" sounds product-related

With keyword aggregation, the classifier sees actual document terms:
```
Collection: human_resources_all
  Description: Employee handbooks and HR policies
  Document keywords: valve(3), employee(5), handbook(2), portal(1), steam(1), ...
```

The classifier now sees "valve" explicitly listed and routes correctly.

### How It Works

**Automatic Aggregation (on document ingestion):**
```python
# In document_processing.py
def update_collection_keywords(db, collection_id: str, keywords: list[str]):
    """Atomically increment keyword frequencies in collection schema."""
    from google.cloud.firestore import Increment

    schema_ref = db.document(f"_system/config/schemas/{collection_id}")
    updates = {}
    for keyword in keywords:
        safe_keyword = keyword.replace(".", "_").replace("/", "_")
        field_path = f"classifier_hints.document_keywords.{safe_keyword}"
        updates[field_path] = Increment(1)

    schema_ref.update(updates)
```

**Manual Rebuild (for existing documents):**
```
POST /api/collections/{id}/rebuild-keywords
```

Or use the "Refresh Keywords" button in the collection dashboard UI.

### Data Model

```
_system/config/schemas/{collectionId}
├── classifier_hints: {
│   ├── keywords: string[]              # Manual keywords (curated)
│   ├── example_queries: string[]       # Example search queries
│   └── document_keywords: {            # Auto-aggregated from documents
│       ├── valve: 3                    # keyword: frequency count
│       ├── employee: 5
│       └── ...
│       }
│   }
```

### Classifier Prompt

The classifier receives both manual and document keywords:

```
Available collections:
- human_resources_all ("HR Policies & Employee Handbooks")
  Description: Employee handbooks and HR policies
  Manual keywords: hr, policies, benefits
  Document keywords (with frequency): valve(3), employee(5), handbook(2), portal(1)
  Example queries: "vacation policy"; "onboarding process"
```

---

## Embedding Generation Patterns

### Pattern 1: Trigger-Based (Recommended)

Firestore trigger automatically generates embeddings when content changes:

```
Document Write → Firestore Trigger → Generate Embedding → Update Document
```

**Pros:**
- Automatic, no client-side logic needed
- Embeddings always in sync with content
- Works with any client (web, mobile, admin SDK)

**Cons:**
- Adds latency to write operations (though non-blocking)
- Requires Cloud Functions deployment

### Pattern 2: On-Demand

Client explicitly calls a function to generate embeddings:

```
Client → Call generateEmbedding() → Update Document
```

**Pros:**
- Full control over when embeddings are generated
- Can batch multiple documents

**Cons:**
- Client must remember to call it
- Risk of stale embeddings

### Recommendation

Use trigger-based for automatic consistency. Use on-demand for:
- Bulk backfills of existing data
- Testing and development
- Special workflows requiring manual control

---

## Embedding Model

| Property | Value |
|----------|-------|
| **Model** | `gemini-embedding-001` |
| **Provider** | Vertex AI |
| **Output Dimensions** | 2048 (configurable, max 3072) |
| **Firestore Max** | 2048 dimensions |
| **Task Types** | `RETRIEVAL_DOCUMENT` (corpus), `RETRIEVAL_QUERY` (search) |

### Why gemini-embedding-001?

- Google's state-of-the-art embedding model
- Supports asymmetric search (different task types for docs vs queries)
- Higher quality semantic matching than text-embedding-005
- Supports dimensionality reduction without retraining

### Why 2048 Dimensions?

- Maximum supported by Firestore vector search
- Higher dimensions capture more semantic nuance
- Optimal balance for gemini-embedding-001 quality

### API Call Example

```python
from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel

model = TextEmbeddingModel.from_pretrained("gemini-embedding-001")

# For corpus documents
inputs = [TextEmbeddingInput(text_to_embed, "RETRIEVAL_DOCUMENT")]
embeddings = model.get_embeddings(inputs, output_dimensionality=2048)

# For search queries (use different task type!)
query_inputs = [TextEmbeddingInput(query_text, "RETRIEVAL_QUERY")]
query_embeddings = model.get_embeddings(query_inputs, output_dimensionality=2048)
```

Note: Vertex AI uses Application Default Credentials (ADC). No API key is required when running in Cloud Functions or with a service account.

---

## Vector Index

Firestore requires a vector index for similarity searches. Without an index, `find_nearest()` will fail.

### Index Properties

| Property | Value | Notes |
|----------|-------|-------|
| **Collection Group** | Your collection name | e.g., `products_documents` |
| **Query Scope** | `COLLECTION` | Searches within collection |
| **Field Path** | `contentEmbedding.vector` | Nested under embedding object |
| **Dimensions** | 2048 | Must match embedding model output |
| **Index Type** | `flat` | Good for < 1M vectors |

### Index Types

| Type | Best For | Characteristics |
|------|----------|-----------------|
| `flat` | < 1M vectors | Exact results, slower |
| HNSW | > 1M vectors | Approximate, faster |

For most applications, `flat` is sufficient and provides exact results.

### Creation Command

```bash
gcloud firestore indexes composite create \
  --collection-group=YOUR_COLLECTION_documents \
  --query-scope=COLLECTION \
  --field-config='field-path=contentEmbedding.vector,vector-config={"dimension":"2048","flat":"{}"}' \
  --database=test \
  --project=YOUR_PROJECT_ID
```

---

## Distance Measures

Firestore supports three distance measures:

| Measure | Range | Best For |
|---------|-------|----------|
| COSINE | 0 to 2 | Text similarity (angle-based) |
| EUCLIDEAN | 0 to ∞ | Spatial data |
| **DOT_PRODUCT** | -1 to 1 | Normalized vectors (recommended) |

### Why DOT_PRODUCT?

- Best performance with normalized embedding vectors
- `gemini-embedding-001` outputs normalized vectors by default
- Higher values = more similar (intuitive)
- Computationally efficient

### Similarity Interpretation (DOT_PRODUCT)

| Similarity Score | Meaning |
|------------------|---------|
| 1.0 | Identical |
| 0.7+ | Very similar |
| 0.4-0.7 | Somewhat similar |
| < 0.4 | Dissimilar |

Note: DOT_PRODUCT returns similarity (higher = better), not distance (lower = better) like COSINE.

---

## Infinite Loop Prevention

When a trigger writes back to the same document, it can cause infinite loops. Prevention strategies:

### Strategy 1: Timestamp Comparison (Recommended)

```python
# Get existing embedding
existing = after_data.get("contentEmbedding")
if existing:
    embedded_at = existing.get("embeddedAt", "")
    content_updated_at = content.get("contentUpdatedAt", "")
    if embedded_at >= content_updated_at:
        return  # Already up to date
```

### Strategy 2: Content Hash

```python
import hashlib
content_hash = hashlib.md5(text_to_embed.encode()).hexdigest()
if existing.get("contentHash") == content_hash:
    return  # Content unchanged
```

### Strategy 3: Change Detection

```python
before_content = before_data.get("content", {})
after_content = after_data.get("content", {})
if before_content.get("contentUpdatedAt") == after_content.get("contentUpdatedAt"):
    return  # Content field unchanged
```

---

## Error Handling Philosophy

Embedding generation should be **non-critical**:

```python
try:
    # Generate and store embedding
    ...
except Exception as e:
    # Log error but DON'T raise
    print(f"Embedding failed: {e}", file=sys.stderr)
    # Original document write still succeeds
```

**Rationale:**
- Users shouldn't see errors for background operations
- Document is still usable without embedding
- Can backfill failed embeddings later
- Search simply won't find the document until embedding exists

---

## Access Control

### Security Rules

Vector embedding fields should be read-only for clients:

```javascript
// firestore.rules
match /documents/{docId} {
  allow read: if isAuthenticated();
  allow write: if isAuthenticated()
    && !request.resource.data.keys().hasAny(['contentEmbedding']);

  // Only Cloud Functions can write contentEmbedding
}
```

### Function Authentication

All search/embedding functions should verify the caller:

```python
if not request.auth:
    raise https_fn.HttpsError(
        code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
        message="Must be authenticated"
    )
```

---

## Performance Considerations

### Embedding Generation Latency

| Component | Time |
|-----------|------|
| Gemini API call | 200-500ms |
| Firestore write | 50-100ms |
| **Total** | ~300-600ms |

This happens asynchronously after the original write returns.

### Search Latency

| Component | Time |
|-----------|------|
| Gemini API (query embedding) | 200-300ms |
| Firestore vector search | 50-200ms |
| **Total** | ~250-500ms |

### Optimization Tips

1. **Debounce client searches** (500ms recommended)
2. **Limit result count** (20-50 is usually sufficient)
3. **Use threshold filtering** to reduce processing
4. **Cache frequent queries** if needed

### Debug Mode Performance

Debug mode runs multiple search permutations, significantly increasing latency:

| Operation | Normal Mode | Debug Mode |
|-----------|-------------|------------|
| Embedding generations | 1 | 1 + N (N = semantic terms) |
| Vector searches | 1 | 1 + N |
| Keyword queries | 0-1 | 0-M (M = exact terms) |
| **Typical total** | ~500ms | ~2-4 seconds |

Debug mode is designed for development and tuning, not production use. The UI shows a warning when debug mode is enabled but the backend hasn't been deployed with the feature.

---

## Scaling Considerations

### Document Count

| Count | Recommendation |
|-------|----------------|
| < 10K | Works great out of the box |
| 10K - 100K | Consider pagination |
| 100K - 1M | Consider HNSW index |
| > 1M | Consider dedicated vector DB |

### Multi-Tenant

For multi-tenant applications, scope searches to a specific tenant:

```python
# Search within a specific tenant's documents
docs_ref = db.collection('tenants').document(tenant_id).collection('documents')
results = docs_ref.find_nearest(...)
```
