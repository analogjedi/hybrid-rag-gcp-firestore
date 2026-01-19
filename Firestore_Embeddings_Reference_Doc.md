# Firestore Vector Embeddings Reference

A comprehensive reference for implementing vector search in Firebase Firestore.

> **Sources:**
> - [Firebase Firestore Vector Search Documentation](https://firebase.google.com/docs/firestore/vector-search)
> - [Google Cloud Firestore Vector Search Documentation](https://cloud.google.com/firestore/docs/vector-search)

---

## Table of Contents

1. [Overview](#overview)
2. [Storing Vector Embeddings](#storing-vector-embeddings)
3. [Creating Vector Indexes](#creating-vector-indexes)
4. [Querying with find_nearest](#querying-with-find_nearest)
5. [Distance Measures](#distance-measures)
6. [Pre-filtering Documents](#pre-filtering-documents)
7. [Retrieving Vector Distance](#retrieving-vector-distance)
8. [Distance Thresholds](#distance-thresholds)
9. [Computing Embeddings with Cloud Functions](#computing-embeddings-with-cloud-functions)
10. [Limitations](#limitations)

---

## Overview

Firestore enables K-nearest neighbor (KNN) vector searches by:
1. Storing vector embeddings in documents
2. Creating vector indexes
3. Executing similarity queries using specified distance measures

**Important:** Firestore does not generate embeddings natively. You must use external services like Vertex AI to generate embeddings before storing them.

---

## Storing Vector Embeddings

Vector embeddings are stored as a special `Vector` type in Firestore documents.

### Python

```python
from google.cloud import firestore
from google.cloud.firestore_v1.vector import Vector

firestore_client = firestore.Client()
collection = firestore_client.collection("coffee-beans")

doc = {
    "name": "Kahawa coffee beans",
    "description": "Information about the Kahawa coffee beans.",
    "embedding_field": Vector([0.18332680, 0.24160706, 0.3416704]),
}

collection.add(doc)
```

### Node.js

```javascript
import {
  Firestore,
  FieldValue,
} from "@google-cloud/firestore";

const db = new Firestore();
const coll = db.collection('coffee-beans');

await coll.add({
  name: "Kahawa coffee beans",
  description: "Information about the Kahawa coffee beans.",
  embedding_field: FieldValue.vector([1.0, 2.0, 3.0])
});
```

### Go

```go
import (
    "context"
    "cloud.google.com/go/firestore"
)

type CoffeeBean struct {
    Name           string             `firestore:"name,omitempty"`
    Description    string             `firestore:"description,omitempty"`
    EmbeddingField firestore.Vector32 `firestore:"embedding_field,omitempty"`
    Color          string             `firestore:"color,omitempty"`
}

func storeVectors(projectID string) error {
    ctx := context.Background()
    client, err := firestore.NewClient(ctx, projectID)
    if err != nil {
        return err
    }
    defer client.Close()

    doc := CoffeeBean{
        Name:           "Kahawa coffee beans",
        Description:    "Information about the Kahawa coffee beans.",
        EmbeddingField: []float32{1.0, 2.0, 3.0},
        Color:          "red",
    }

    ref := client.Collection("coffee-beans").NewDoc()
    _, err = ref.Set(ctx, doc)
    return err
}
```

### Java

```java
import com.google.cloud.firestore.CollectionReference;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.FieldValue;

CollectionReference coll = firestore.collection("coffee-beans");

Map<String, Object> docData = new HashMap<>();
docData.put("name", "Kahawa coffee beans");
docData.put("description", "Information about the Kahawa coffee beans.");
docData.put("embedding_field", FieldValue.vector(new double[] {1.0, 2.0, 3.0}));

ApiFuture<DocumentReference> future = coll.add(docData);
DocumentReference documentReference = future.get();
```

---

## Creating Vector Indexes

Firestore requires a vector index for similarity searches. Without an index, `find_nearest()` queries will fail.

### Create a Vector Index

```bash
gcloud firestore indexes composite create \
  --collection-group=COLLECTION_NAME \
  --query-scope=COLLECTION \
  --field-config field-path=VECTOR_FIELD,vector-config='{"dimension":"DIMENSION", "flat": "{}"}' \
  --database=DATABASE_ID
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `collection-group` | Name of the collection to index |
| `query-scope` | `COLLECTION` or `COLLECTION_GROUP` |
| `field-path` | Path to the vector field (e.g., `embedding_field` or `contentEmbedding.vector`) |
| `dimension` | Number of dimensions (max 2048) |
| `database` | Database ID (use `(default)` for default database) |

### Example: 768-Dimension Index

```bash
gcloud firestore indexes composite create \
  --collection-group=documents \
  --query-scope=COLLECTION_GROUP \
  --field-config=field-path=contentEmbedding.vector,vector-config='{"dimension":"768","flat":"{}"}' \
  --database="(default)" \
  --project=YOUR_PROJECT_ID
```

### Create Composite Index (Vector + Filter Field)

For queries that combine vector search with field filters:

```bash
gcloud firestore indexes composite create \
  --collection-group=coffee-beans \
  --query-scope=COLLECTION \
  --field-config=order=ASCENDING,field-path="color" \
  --field-config=field-path=embedding_field,vector-config='{"dimension":"768", "flat": "{}"}' \
  --database="(default)"
```

### Manage Indexes

```bash
# List all indexes
gcloud firestore indexes composite list --database=DATABASE_ID

# Describe an index
gcloud firestore indexes composite describe INDEX_ID --database=DATABASE_ID

# Delete an index
gcloud firestore indexes composite delete INDEX_ID --database=DATABASE_ID
```

### Index Types

| Type | Best For | Characteristics |
|------|----------|-----------------|
| `flat` | < 1M vectors | Exact results, simpler |
| `hnsw` | > 1M vectors | Approximate results, faster |

For most applications, `flat` is sufficient and provides exact results.

---

## Querying with find_nearest

### Python

```python
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector

collection = db.collection("coffee-beans")

vector_query = collection.find_nearest(
    vector_field="embedding_field",
    query_vector=Vector([0.3416704, 0.18332680, 0.24160706]),
    distance_measure=DistanceMeasure.EUCLIDEAN,
    limit=5,
)

docs = vector_query.stream()
for doc in docs:
    print(f"{doc.id}: {doc.to_dict()}")
```

### Node.js

```javascript
import {
  Firestore,
  FieldValue,
  VectorQuery,
  VectorQuerySnapshot,
} from "@google-cloud/firestore";

const db = new Firestore();
const coll = db.collection('coffee-beans');

const vectorQuery = coll.findNearest({
  vectorField: 'embedding_field',
  queryVector: [3.0, 1.0, 2.0],
  limit: 10,
  distanceMeasure: 'EUCLIDEAN'
});

const vectorQuerySnapshot = await vectorQuery.get();
vectorQuerySnapshot.forEach((doc) => {
  console.log(doc.id, doc.data());
});
```

### Go

```go
collection := client.Collection("coffee-beans")

vectorQuery := collection.FindNearest("embedding_field",
    []float32{3.0, 1.0, 2.0},
    5,
    firestore.DistanceMeasureEuclidean,
    nil)

docs, err := vectorQuery.Documents(ctx).GetAll()
for _, doc := range docs {
    fmt.Println(doc.Data()["name"])
}
```

### Java

```java
import com.google.cloud.firestore.VectorQuery;
import com.google.cloud.firestore.VectorQuerySnapshot;

CollectionReference coll = firestore.collection("coffee-beans");

VectorQuery vectorQuery = coll.findNearest(
    "embedding_field",
    new double[] {3.0, 1.0, 2.0},
    /* limit */ 10,
    VectorQuery.DistanceMeasure.EUCLIDEAN);

ApiFuture<VectorQuerySnapshot> future = vectorQuery.get();
VectorQuerySnapshot vectorQuerySnapshot = future.get();

for (DocumentSnapshot doc : vectorQuerySnapshot.getDocuments()) {
    System.out.println(doc.getId() + ": " + doc.getData());
}
```

---

## Distance Measures

Firestore supports three distance measures for vector similarity:

| Measure | Range | Description |
|---------|-------|-------------|
| **EUCLIDEAN** | 0 to ∞ | Measures straight-line distance between vectors. Lower = more similar. |
| **COSINE** | 0 to 2 | Compares vectors based on angle, ignoring magnitude. Lower = more similar. |
| **DOT_PRODUCT** | -∞ to ∞ | Similar to COSINE but affected by magnitude. Higher = more similar. |

### Choosing a Distance Measure

| Scenario | Recommendation |
|----------|----------------|
| Normalized embeddings | Use **DOT_PRODUCT** (most efficient) |
| Non-normalized embeddings | Use **COSINE** or **EUCLIDEAN** |
| Uncertain normalization | Use **COSINE** (normalizes internally) |
| Text similarity | **COSINE** is industry standard |

### Distance Interpretation (COSINE)

| Distance | Meaning |
|----------|---------|
| 0.0 | Identical |
| 0.2 | Very similar |
| 0.4 | Somewhat similar |
| 0.6+ | Dissimilar |
| 2.0 | Opposite |

### Using Different Distance Measures

**Python:**
```python
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure

# EUCLIDEAN
vector_query = collection.find_nearest(
    vector_field="embedding_field",
    query_vector=Vector([...]),
    distance_measure=DistanceMeasure.EUCLIDEAN,
    limit=10,
)

# COSINE
vector_query = collection.find_nearest(
    vector_field="embedding_field",
    query_vector=Vector([...]),
    distance_measure=DistanceMeasure.COSINE,
    limit=10,
)

# DOT_PRODUCT
vector_query = collection.find_nearest(
    vector_field="embedding_field",
    query_vector=Vector([...]),
    distance_measure=DistanceMeasure.DOT_PRODUCT,
    limit=10,
)
```

**Node.js:**
```javascript
// EUCLIDEAN
const query = coll.findNearest({
  vectorField: 'embedding_field',
  queryVector: [...],
  limit: 10,
  distanceMeasure: 'EUCLIDEAN'
});

// COSINE
const query = coll.findNearest({
  vectorField: 'embedding_field',
  queryVector: [...],
  limit: 10,
  distanceMeasure: 'COSINE'
});

// DOT_PRODUCT
const query = coll.findNearest({
  vectorField: 'embedding_field',
  queryVector: [...],
  limit: 10,
  distanceMeasure: 'DOT_PRODUCT'
});
```

---

## Pre-filtering Documents

Combine vector searches with equality filters using composite indexes.

### Python

```python
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector

collection = db.collection("coffee-beans")

# Filter by color, then find nearest vectors
vector_query = collection.where("color", "==", "red").find_nearest(
    vector_field="embedding_field",
    query_vector=Vector([0.3416704, 0.18332680, 0.24160706]),
    distance_measure=DistanceMeasure.EUCLIDEAN,
    limit=5,
)
```

### Node.js

```javascript
const preFilteredVectorQuery = coll
    .where("color", "==", "red")
    .findNearest({
      vectorField: "embedding_field",
      queryVector: [3.0, 1.0, 2.0],
      limit: 5,
      distanceMeasure: "EUCLIDEAN",
    });

const vectorQueryResults = await preFilteredVectorQuery.get();
```

### Go

```go
vectorQuery := collection.Where("color", "==", "red").
    FindNearest("embedding_field",
        []float32{3.0, 1.0, 2.0},
        5,
        firestore.DistanceMeasureEuclidean,
        nil)
```

### Java

```java
VectorQuery preFilteredVectorQuery = coll
    .whereEqualTo("color", "red")
    .findNearest(
        "embedding_field",
        new double[] {3.0, 1.0, 2.0},
        /* limit */ 10,
        VectorQuery.DistanceMeasure.EUCLIDEAN);
```

**Note:** Pre-filtering requires a composite index that includes both the filter field and the vector field.

---

## Retrieving Vector Distance

Use `distance_result_field` to get the computed distance for each result.

### Python

```python
vector_query = collection.find_nearest(
    vector_field="embedding_field",
    query_vector=Vector([0.3416704, 0.18332680, 0.24160706]),
    distance_measure=DistanceMeasure.EUCLIDEAN,
    limit=10,
    distance_result_field="vector_distance",
)

docs = vector_query.stream()
for doc in docs:
    print(f"{doc.id}, Distance: {doc.get('vector_distance')}")
```

### Node.js

```javascript
const vectorQuery = coll.findNearest({
  vectorField: 'embedding_field',
  queryVector: [3.0, 1.0, 2.0],
  limit: 10,
  distanceMeasure: 'EUCLIDEAN',
  distanceResultField: 'vector_distance'
});

const snapshot = await vectorQuery.get();
snapshot.forEach((doc) => {
  console.log(doc.id, 'Distance:', doc.get('vector_distance'));
});
```

### Go

```go
vectorQuery := collection.FindNearest("embedding_field",
    []float32{3.0, 1.0, 2.0},
    10,
    firestore.DistanceMeasureEuclidean,
    &firestore.FindNearestOptions{
        DistanceResultField: "vector_distance",
    })

docs, _ := vectorQuery.Documents(ctx).GetAll()
for _, doc := range docs {
    fmt.Printf("%v, Distance: %v\n", doc.Data()["name"], doc.Data()["vector_distance"])
}
```

### Java

```java
VectorQuery vectorQuery = coll.findNearest(
    "embedding_field",
    new double[] {3.0, 1.0, 2.0},
    /* limit */ 10,
    VectorQuery.DistanceMeasure.EUCLIDEAN,
    VectorQueryOptions.newBuilder()
        .setDistanceResultField("vector_distance")
        .build());

for (DocumentSnapshot document : vectorQuerySnapshot.getDocuments()) {
    System.out.println(document.getId() + " Distance: " + document.get("vector_distance"));
}
```

### With Field Selection

Select only specific fields plus the distance:

```python
vector_query = collection.select(["name", "color", "vector_distance"]).find_nearest(
    vector_field="embedding_field",
    query_vector=Vector([0.3416704, 0.18332680, 0.24160706]),
    distance_measure=DistanceMeasure.EUCLIDEAN,
    limit=10,
    distance_result_field="vector_distance",
)
```

---

## Distance Thresholds

Filter results to only include documents within a similarity threshold.

### Python

```python
vector_query = collection.find_nearest(
    vector_field="embedding_field",
    query_vector=Vector([0.3416704, 0.18332680, 0.24160706]),
    distance_measure=DistanceMeasure.EUCLIDEAN,
    limit=10,
    distance_threshold=4.5,
)
```

### Node.js

```javascript
const vectorQuery = coll.findNearest({
  vectorField: 'embedding_field',
  queryVector: [3.0, 1.0, 2.0],
  limit: 10,
  distanceMeasure: 'EUCLIDEAN',
  distanceThreshold: 4.5
});
```

### Go

```go
vectorQuery := collection.FindNearest("embedding_field",
    []float32{3.0, 1.0, 2.0},
    10,
    firestore.DistanceMeasureEuclidean,
    &firestore.FindNearestOptions{
        DistanceThreshold: firestore.Ptr[float64](4.5),
    })
```

### Java

```java
VectorQuery vectorQuery = coll.findNearest(
    "embedding_field",
    new double[] {3.0, 1.0, 2.0},
    /* limit */ 10,
    VectorQuery.DistanceMeasure.EUCLIDEAN,
    VectorQueryOptions.newBuilder()
        .setDistanceThreshold(4.5)
        .build());
```

### Threshold Behavior

| Distance Measure | Threshold Behavior |
|------------------|-------------------|
| EUCLIDEAN | Returns documents where `distance ≤ threshold` |
| COSINE | Returns documents where `distance ≤ threshold` |
| DOT_PRODUCT | Returns documents where `distance ≥ threshold` |

---

## Computing Embeddings with Cloud Functions

Automatically generate and store embeddings when documents are created or updated.

### Python (Cloud Function)

```python
import functions_framework
from google.cloud import firestore

firestore_client = firestore.Client()

@functions_framework.cloud_event
def store_embedding(cloud_event) -> None:
    """Triggers by a change to a Firestore document."""
    firestore_payload = firestore.DocumentEventData()
    payload = firestore_payload._pb.ParseFromString(cloud_event.data)

    collection_id, doc_id = from_payload(payload)

    # Call a function to calculate the embedding
    embedding = calculate_embedding(payload)

    # Update the document
    doc = firestore_client.collection(collection_id).document(doc_id)
    doc.set({"embedding_field": embedding}, merge=True)
```

### Node.js (Cloud Function)

```javascript
import { onDocumentWritten } from "firebase-functions/v2/firestore";

export const storeEmbedding = onDocumentWritten(
  "documents/{docId}",
  async (event) => {
    // Get the previous and current document snapshots
    const previousDocumentSnapshot = event.data.before;
    const currentDocumentSnapshot = event.data.after;

    // Get content values
    const previousContent = previousDocumentSnapshot?.get("content");
    const currentContent = currentDocumentSnapshot?.get("content");

    // Don't update if content didn't change
    if (previousContent === currentContent) {
      return;
    }

    // Calculate the embedding
    const embeddingVector = await calculateEmbedding(currentContent);

    // Update the document with the embedding
    await currentDocumentSnapshot.ref.update({
      embedding: FieldValue.vector(embeddingVector),
    });
  }
);
```

### Using Vertex AI for Embeddings

```python
from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel

def generate_embedding(text: str) -> list[float]:
    """Generate embeddings using Vertex AI."""
    model = TextEmbeddingModel.from_pretrained("text-embedding-005")
    inputs = [TextEmbeddingInput(text, "RETRIEVAL_DOCUMENT")]
    embeddings = model.get_embeddings(inputs, output_dimensionality=768)
    return embeddings[0].values
```

---

## Limitations

| Limitation | Value |
|------------|-------|
| Maximum embedding dimensions | 2048 |
| Maximum documents per query | 1000 |
| Real-time snapshot listeners | Not supported |
| Supported languages | Python, Node.js, Go, Java |

### Additional Considerations

- **Index build time**: Can take minutes to hours depending on collection size
- **Cost**: Vector indexes and queries count toward Firestore read/write costs
- **Embedding generation**: Must be done externally (Vertex AI, OpenAI, etc.)
- **Non-default databases**: Firestore triggers may have limitations with named databases

---

## Quick Reference

### Store a Vector (Python)
```python
from google.cloud.firestore_v1.vector import Vector
doc_ref.set({"embedding": Vector([0.1, 0.2, 0.3])})
```

### Store a Vector (Node.js)
```javascript
import { FieldValue } from "@google-cloud/firestore";
docRef.set({ embedding: FieldValue.vector([0.1, 0.2, 0.3]) });
```

### Create Index (CLI)
```bash
gcloud firestore indexes composite create \
  --collection-group=COLLECTION \
  --query-scope=COLLECTION \
  --field-config=field-path=embedding,vector-config='{"dimension":"768","flat":"{}"}' \
  --database="(default)"
```

### Query Vectors (Python)
```python
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector

results = collection.find_nearest(
    vector_field="embedding",
    query_vector=Vector(query_embedding),
    distance_measure=DistanceMeasure.COSINE,
    limit=10,
    distance_result_field="distance",
).stream()
```

### Query Vectors (Node.js)
```javascript
const results = await coll.findNearest({
  vectorField: 'embedding',
  queryVector: queryEmbedding,
  limit: 10,
  distanceMeasure: 'COSINE',
  distanceResultField: 'distance'
}).get();
```

---

*Last updated: January 2026*
