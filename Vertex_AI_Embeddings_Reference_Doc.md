# Vertex AI Text Embeddings Reference

A comprehensive reference for generating text embeddings using Google Vertex AI.

> **Sources:**
> - [Get Text Embeddings - Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings)
> - [Embedding Task Types - Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/docs/embeddings/task-types)

---

## Table of Contents

1. [Overview](#overview)
2. [Supported Models](#supported-models)
3. [Task Types](#task-types)
4. [API Usage](#api-usage)
5. [Code Examples](#code-examples)
6. [Best Practices](#best-practices)
7. [Limitations](#limitations)

---

## Overview

Vertex AI's text embeddings API generates dense vector representations of text, enabling semantic search capabilities. Dense vectors represent the **meaning** of text rather than relying on direct word matches.

**Key characteristics:**
- Vectors are **normalized** - cosine similarity, dot product, and Euclidean distance provide equivalent similarity rankings
- Embeddings integrate with Firestore Vector Search and Vertex AI Vector Search for low-latency retrieval
- Task types optimize embeddings for specific use cases without custom fine-tuning

---

## Supported Models

### Google First-Party Models

| Model | Best For | Max Dimensions | Max Input |
|-------|----------|----------------|-----------|
| `gemini-embedding-001` | State-of-the-art: English, multilingual, code | 3072 | 2048 tokens |
| `text-embedding-005` | English and code specialist | 768 | 2048 tokens |
| `text-multilingual-embedding-002` | Multilingual tasks | 768 | 2048 tokens |

### Open Models (via Model Garden)

| Model | Layers | Max Dimensions |
|-------|--------|----------------|
| `multilingual-e5-small` | 12 | 384 |
| `multilingual-e5-large` | 24 | 1024 |

### Model Selection Guide

| Use Case | Recommended Model |
|----------|-------------------|
| English document search | `text-embedding-005` |
| Multilingual content | `text-multilingual-embedding-002` or `gemini-embedding-001` |
| Code search | `text-embedding-005` or `gemini-embedding-001` |
| Highest quality (any language) | `gemini-embedding-001` |
| Cost-sensitive applications | `text-embedding-005` (768 dims) |

---

## Task Types

Task types optimize embeddings for specific use cases. They solve the semantic gap problem (e.g., questions and answers aren't naturally similar) without requiring expensive fine-tuning.

### Retrieval Use Cases (Asymmetric)

These require **different task types** for documents versus queries:

#### RETRIEVAL_DOCUMENT + RETRIEVAL_QUERY

Standard document search pattern:

| Component | Task Type | When to Use |
|-----------|-----------|-------------|
| Corpus (documents) | `RETRIEVAL_DOCUMENT` | Embed once, store in vector DB |
| User queries | `RETRIEVAL_QUERY` | Embed at search time |

```python
# Embed documents (done once)
doc_embeddings = model.get_embeddings(
    [TextEmbeddingInput(doc, "RETRIEVAL_DOCUMENT") for doc in documents]
)

# Embed query (done per search)
query_embedding = model.get_embeddings(
    [TextEmbeddingInput(query, "RETRIEVAL_QUERY")]
)
```

#### RETRIEVAL_DOCUMENT + QUESTION_ANSWERING

When queries are formal questions:

| Component | Task Type | Example |
|-----------|-----------|---------|
| Corpus | `RETRIEVAL_DOCUMENT` | FAQ documents |
| Queries | `QUESTION_ANSWERING` | "Why is the sky blue?" |

Best when all queries are expected to be proper questions.

#### RETRIEVAL_DOCUMENT + FACT_VERIFICATION

For verifying statements against a corpus:

| Component | Task Type | Example |
|-----------|-----------|---------|
| Corpus | `RETRIEVAL_DOCUMENT` | Knowledge base articles |
| Queries | `FACT_VERIFICATION` | "The Earth is flat" |

Returns documents that prove or disprove the statement.

#### RETRIEVAL_DOCUMENT + CODE_RETRIEVAL_QUERY

Semantic code search (available in `text-embedding-005`):

| Component | Task Type | Example |
|-----------|-----------|---------|
| Corpus | `RETRIEVAL_DOCUMENT` | Code blocks, functions |
| Queries | `CODE_RETRIEVAL_QUERY` | "sort an array" |

Enables natural language → code matching.

### Single-Input Use Cases (Symmetric)

These use the **same task type** for all inputs:

#### CLASSIFICATION

Optimized for categorizing text by predefined labels:

```python
# Embed text for classification
embedding = model.get_embeddings(
    [TextEmbeddingInput(text, "CLASSIFICATION")]
)
# Use embedding with classifier (e.g., nearest label embedding)
```

**Use cases:**
- Sentiment analysis (positive/negative/neutral)
- Topic categorization
- Intent detection

#### CLUSTERING

Optimized for grouping similar texts:

```python
# Embed texts for clustering
embeddings = model.get_embeddings(
    [TextEmbeddingInput(text, "CLUSTERING") for text in texts]
)
# Use with clustering algorithm (K-means, HDBSCAN, etc.)
```

**Use cases:**
- Customer segmentation
- Product categorization
- Trend identification
- Feedback categorization
- Patient grouping (healthcare)

#### SEMANTIC_SIMILARITY

Optimized for comparing text similarity:

```python
# Compare two texts
emb1 = model.get_embeddings([TextEmbeddingInput(text1, "SEMANTIC_SIMILARITY")])
emb2 = model.get_embeddings([TextEmbeddingInput(text2, "SEMANTIC_SIMILARITY")])
similarity = cosine_similarity(emb1, emb2)
```

**Use cases:**
- Duplicate detection
- Recommendation systems
- Paraphrase identification

**Note:** Not intended for retrieval/search use cases.

### Task Type Summary

| Task Type | Format | Use Case |
|-----------|--------|----------|
| `RETRIEVAL_DOCUMENT` | Asymmetric (corpus) | Document search corpus |
| `RETRIEVAL_QUERY` | Asymmetric (query) | Search queries |
| `QUESTION_ANSWERING` | Asymmetric (query) | Formal questions |
| `FACT_VERIFICATION` | Asymmetric (query) | Verify statements |
| `CODE_RETRIEVAL_QUERY` | Asymmetric (query) | Natural language code search |
| `CLASSIFICATION` | Symmetric | Categorization |
| `CLUSTERING` | Symmetric | Grouping similar items |
| `SEMANTIC_SIMILARITY` | Symmetric | Pairwise comparison |

### Default Recommendation

> If your use case doesn't align with a documented task type, use `RETRIEVAL_QUERY` as the default.

---

## API Usage

### API Limits

| Limit | Value |
|-------|-------|
| Max texts per request | 250 |
| Max total tokens per request | 20,000 |
| Max tokens per text | 2,048 (silently truncated) |

### Key Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `task_type` | Optimization target (see Task Types) | None |
| `output_dimensionality` | Vector size (smaller = less storage) | Model max |
| `auto_truncate` | Truncate inputs exceeding token limit | `true` |
| `title` | Optional document title for context | None |

### Dimensionality Trade-offs

| Dimensions | Storage | Quality | Use Case |
|------------|---------|---------|----------|
| 768 | Lower | Good | Cost-sensitive, large corpora |
| 1024 | Medium | Better | Balanced |
| 3072 | Higher | Best | Quality-critical applications |

Smaller dimensions maintain quality while reducing storage and compute costs.

---

## Code Examples

### Python (Vertex AI SDK)

```python
from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel

# Initialize model
model = TextEmbeddingModel.from_pretrained("text-embedding-005")

# Single text embedding
def get_embedding(text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> list[float]:
    inputs = [TextEmbeddingInput(text, task_type)]
    embeddings = model.get_embeddings(inputs, output_dimensionality=768)
    return embeddings[0].values

# Batch embedding
def get_embeddings_batch(
    texts: list[str],
    task_type: str = "RETRIEVAL_DOCUMENT",
    dimensionality: int = 768
) -> list[list[float]]:
    inputs = [TextEmbeddingInput(text, task_type) for text in texts]
    embeddings = model.get_embeddings(inputs, output_dimensionality=dimensionality)
    return [emb.values for emb in embeddings]

# Usage
doc_embedding = get_embedding("Product description here", "RETRIEVAL_DOCUMENT")
query_embedding = get_embedding("find products with feature X", "RETRIEVAL_QUERY")
```

### Python (Google GenAI SDK)

```python
from google import genai
from google.genai.types import EmbedContentConfig

client = genai.Client()

response = client.models.embed_content(
    model="gemini-embedding-001",
    contents=[
        "How do I get a driver's license?",
        "How long is my driver's license valid?"
    ],
    config=EmbedContentConfig(
        task_type="RETRIEVAL_DOCUMENT",
        output_dimensionality=3072,
        title="Driver's License FAQ"  # Optional context
    ),
)

embeddings = [emb.values for emb in response.embeddings]
```

### Node.js

```javascript
const { GoogleGenAI } = require('@google/genai');

const client = new GoogleGenAI({
    vertexai: true,
    project: 'your-project-id',
});

async function getEmbedding(text, taskType = 'RETRIEVAL_DOCUMENT') {
    const response = await client.models.embedContent({
        model: 'gemini-embedding-001',
        contents: text,
        config: {
            taskType: taskType,
            outputDimensionality: 768,
        },
    });
    return response.embeddings[0].values;
}

// Usage
const docEmbedding = await getEmbedding('Document content', 'RETRIEVAL_DOCUMENT');
const queryEmbedding = await getEmbedding('search query', 'RETRIEVAL_QUERY');
```

### REST API

**Endpoint:**
```
POST https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/us-central1/publishers/google/models/MODEL_ID:predict
```

**Request body:**
```json
{
  "instances": [
    {
      "content": "Text to embed",
      "task_type": "RETRIEVAL_DOCUMENT"
    }
  ],
  "parameters": {
    "autoTruncate": true,
    "outputDimensionality": 768
  }
}
```

**Response:**
```json
{
  "predictions": [
    {
      "embeddings": {
        "values": [0.123, -0.456, ...],
        "statistics": {
          "truncated": false,
          "token_count": 15
        }
      }
    }
  ]
}
```

### Complete Search Example

```python
from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel
from google.cloud.firestore_v1.vector import Vector
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud import firestore

# Initialize
embedding_model = TextEmbeddingModel.from_pretrained("text-embedding-005")
db = firestore.Client()

def embed_document(text: str) -> list[float]:
    """Embed text for storage."""
    inputs = [TextEmbeddingInput(text, "RETRIEVAL_DOCUMENT")]
    return embedding_model.get_embeddings(inputs, output_dimensionality=768)[0].values

def embed_query(text: str) -> list[float]:
    """Embed text for search."""
    inputs = [TextEmbeddingInput(text, "RETRIEVAL_QUERY")]
    return embedding_model.get_embeddings(inputs, output_dimensionality=768)[0].values

def store_document(collection: str, doc_id: str, content: str, metadata: dict):
    """Store document with embedding."""
    embedding = embed_document(content)
    doc_ref = db.collection(collection).document(doc_id)
    doc_ref.set({
        **metadata,
        "content": content,
        "embedding": Vector(embedding),
    })

def search_documents(collection: str, query: str, limit: int = 10):
    """Search documents by semantic similarity."""
    query_vector = embed_query(query)

    results = db.collection(collection).find_nearest(
        vector_field="embedding",
        query_vector=Vector(query_vector),
        distance_measure=DistanceMeasure.COSINE,
        limit=limit,
        distance_result_field="distance",
    ).stream()

    return [
        {"id": doc.id, "distance": doc.get("distance"), **doc.to_dict()}
        for doc in results
    ]
```

---

## Best Practices

### 1. Use Appropriate Task Types

```python
# CORRECT: Different task types for corpus vs query
corpus_embedding = get_embedding(doc, "RETRIEVAL_DOCUMENT")
query_embedding = get_embedding(query, "RETRIEVAL_QUERY")

# INCORRECT: Same task type for both
corpus_embedding = get_embedding(doc, "RETRIEVAL_QUERY")  # Wrong!
query_embedding = get_embedding(query, "RETRIEVAL_QUERY")
```

### 2. Batch Requests Efficiently

```python
# GOOD: Batch multiple texts (up to 250)
texts = ["text1", "text2", "text3", ...]
inputs = [TextEmbeddingInput(t, "RETRIEVAL_DOCUMENT") for t in texts]
embeddings = model.get_embeddings(inputs)

# AVOID: One request per text
for text in texts:
    embedding = model.get_embeddings([TextEmbeddingInput(text, "RETRIEVAL_DOCUMENT")])
```

### 3. Choose Dimensionality Wisely

```python
# For large corpora (>100K docs), consider lower dimensions
embeddings = model.get_embeddings(inputs, output_dimensionality=256)

# For quality-critical applications, use higher dimensions
embeddings = model.get_embeddings(inputs, output_dimensionality=768)
```

### 4. Handle Long Texts

```python
# Option 1: Let API truncate (default)
embedding = model.get_embeddings([TextEmbeddingInput(long_text, task)])

# Option 2: Chunk text manually for better coverage
def chunk_text(text: str, max_tokens: int = 1500) -> list[str]:
    # Split into chunks (implement based on your needs)
    words = text.split()
    chunks = []
    current_chunk = []
    for word in words:
        current_chunk.append(word)
        if len(current_chunk) >= max_tokens:
            chunks.append(" ".join(current_chunk))
            current_chunk = []
    if current_chunk:
        chunks.append(" ".join(current_chunk))
    return chunks

# Embed each chunk
chunks = chunk_text(long_document)
chunk_embeddings = [get_embedding(chunk, "RETRIEVAL_DOCUMENT") for chunk in chunks]
```

### 5. Normalize for Consistency

Vertex AI embeddings are already normalized, so you can use any distance measure:

```python
# All three produce equivalent similarity rankings:
# - Cosine similarity
# - Dot product
# - Euclidean distance (inverted)
```

---

## Limitations

| Limitation | Details |
|------------|---------|
| Region | Available in `us-central1` only |
| Batch predictions | Not supported |
| Model customization | Not available |
| Max request size | 250 texts, 20K total tokens |
| Max input length | 2048 tokens per text |
| Preview models | Not recommended for production |

### Rate Limits

Check your project's quotas in the Google Cloud Console for:
- Requests per minute
- Tokens per minute

---

## Quick Reference

### Embed Document (Python)
```python
from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel

model = TextEmbeddingModel.from_pretrained("text-embedding-005")
inputs = [TextEmbeddingInput(text, "RETRIEVAL_DOCUMENT")]
embedding = model.get_embeddings(inputs, output_dimensionality=768)[0].values
```

### Embed Query (Python)
```python
inputs = [TextEmbeddingInput(query, "RETRIEVAL_QUERY")]
embedding = model.get_embeddings(inputs, output_dimensionality=768)[0].values
```

### Task Type Selection
```
Document search → RETRIEVAL_DOCUMENT (corpus) + RETRIEVAL_QUERY (query)
Q&A system     → RETRIEVAL_DOCUMENT (corpus) + QUESTION_ANSWERING (query)
Code search    → RETRIEVAL_DOCUMENT (corpus) + CODE_RETRIEVAL_QUERY (query)
Categorization → CLASSIFICATION
Grouping       → CLUSTERING
Comparison     → SEMANTIC_SIMILARITY
```

---

*Last updated: January 2026*
