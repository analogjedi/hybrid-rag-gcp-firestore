# Vector Embeddings Architecture

This document provides technical details on implementing vector embeddings in Firestore.

## Data Model

### Document Structure

Documents that need semantic search should include a `content` field (or similar) that contains the text to be embedded, plus a `contentEmbedding` field that stores the vector:

```
{collection}/{documentId}
├── content: {
│   ├── summary: "7nm FinFET process flow with stress engineering"
│   ├── details: "This document describes the complete..."
│   ├── contentUpdatedAt: "2026-01-03T14:30:00Z"
│   └── ...other fields
│   }
└── contentEmbedding: {
    ├── vector: Vector([0.123, -0.456, ...])  ← 2048 floats
    ├── embeddedAt: "2026-01-03T14:30:05Z"
    └── modelVersion: "gemini-embedding-001"
    }
```

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
