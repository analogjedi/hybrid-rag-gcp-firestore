# Vector Index Setup

Firestore requires vector indexes to enable similarity searches. Without these indexes, `find_nearest()` queries will fail.

## Create Document Vector Index

Each collection needs its own vector index for document search:

```bash
gcloud firestore indexes composite create \
  --collection-group=YOUR_COLLECTION_documents \
  --query-scope=COLLECTION \
  --field-config='field-path=contentEmbedding.vector,vector-config={"dimension":"2048","flat":"{}"}' \
  --database=test \
  --project=YOUR_PROJECT_ID
```

Replace:
- `YOUR_COLLECTION_documents` with your collection name (e.g., `products_and_datasheets_documents`)
- `YOUR_PROJECT_ID` with your Firebase project ID

## Create Element Vector Index

A single collection group index enables element search (tables, figures, images) across all documents:

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

This index enables:
- Searching across all `elements` subcollections
- Filtering by `collectionId` (to scope to a specific document collection)
- Filtering by `status` (only search "ready" elements)
- Vector similarity search on element embeddings

## Index Parameters Explained

| Parameter | Value | Description |
|-----------|-------|-------------|
| `--collection-group` | `documents` | Collection(s) to index |
| `--query-scope` | `COLLECTION_GROUP` | Search across all subcollections |
| `--field-path` | `contentEmbedding.vector` | Path to the vector field |
| `dimension` | `2048` | Must match embedding model output |
| `flat` | `{}` | Index type (see below) |

## Index Types

### Flat Index (Recommended for < 1M documents)

```json
{"dimension":"2048","flat":"{}"}
```

- **Pros**: Exact results, simpler
- **Cons**: Slower for very large collections
- **Best for**: Most applications with under 1 million documents

### HNSW Index (For > 1M documents)

```json
{"dimension":"2048","hnsw":{"m":16,"ef_construction":200}}
```

- **Pros**: Faster for large collections
- **Cons**: Approximate results, more complex tuning
- **Best for**: Collections with millions of vectors

## Check Index Status

```bash
gcloud firestore indexes composite list --project=YOUR_PROJECT_ID
```

Look for your index in the output. States:
- `CREATING` - Index is being built (can take minutes to hours)
- `READY` - Index is ready to use
- `NEEDS_BACKFILL` - Index exists but needs data

## Wait for Index Creation

Indexes can take time to build, especially for large collections:

| Documents | Estimated Time |
|-----------|---------------|
| < 1,000 | < 1 minute |
| 1,000 - 10,000 | 1-5 minutes |
| 10,000 - 100,000 | 5-30 minutes |
| 100,000+ | 30+ minutes |

You can check progress in the Firebase Console under Firestore > Indexes.

## Delete an Index

If you need to recreate the index:

```bash
gcloud firestore indexes composite delete INDEX_ID --project=YOUR_PROJECT_ID
```

Get the INDEX_ID from the list command.

## Troubleshooting

### Error: "Index not found"

The vector index doesn't exist or isn't ready yet.

**Solution:**
1. Create the index with the command above
2. Wait for it to reach READY state
3. Retry your search

### Error: "Dimension mismatch"

The index dimension doesn't match your embedding dimension.

**Solution:**
1. Delete the existing index
2. Recreate with correct dimension (2048 for gemini-embedding-001)

### Error: "Permission denied"

Your account doesn't have permission to create indexes.

**Solution:**
1. Ensure you're authenticated: `gcloud auth login`
2. Check you have the `datastore.indexes.create` permission
3. Or use a service account with appropriate roles

### Searches return no results

Possible causes:
1. Index is still building
2. No documents have embeddings yet
3. Embeddings use a different field path
4. Distance threshold is too strict

**Debug steps:**
1. Check index status
2. Verify documents have `contentEmbedding.vector` field
3. Try with threshold=1.0 to see all results

## Multiple Collections

If you have multiple collections with embeddings, create a document index for each:

```bash
# Design specs collection
gcloud firestore indexes composite create \
  --collection-group=design_specs_documents \
  --query-scope=COLLECTION \
  --field-config=field-path=contentEmbedding.vector,vector-config='{"dimension":"2048","flat":"{}"}' \
  --database=test \
  --project=YOUR_PROJECT_ID

# Process docs collection
gcloud firestore indexes composite create \
  --collection-group=process_docs_documents \
  --query-scope=COLLECTION \
  --field-config=field-path=contentEmbedding.vector,vector-config='{"dimension":"2048","flat":"{}"}' \
  --database=test \
  --project=YOUR_PROJECT_ID
```

**Note:** The element index only needs to be created once—it uses `COLLECTION_GROUP` scope to search across all `elements` subcollections regardless of which parent collection they belong to.

## Subcollections

If your documents are in subcollections (e.g., `tenants/{tenantId}/documents`), use `COLLECTION_GROUP` scope to search across all tenants:

```bash
gcloud firestore indexes composite create \
  --collection-group=documents \
  --query-scope=COLLECTION_GROUP \
  ...
```

To search within a single tenant, your query code should scope to that tenant's subcollection - the index will still work.
