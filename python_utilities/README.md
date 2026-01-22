# Python Utilities

Command-line utilities for managing embeddings in the Firestore knowledge system.

## Prerequisites

### 1. Service Account Credentials

These utilities require a service account JSON file with appropriate permissions:

```
firestore_embeddings_reference/
├── service-account.json    # <-- Required (not in git)
└── python_utilities/
    ├── ...
```

**Required IAM Roles for the service account:**
- `roles/datastore.user` - Firestore read/write access
- `roles/aiplatform.user` - Vertex AI embedding generation
- `roles/storage.objectAdmin` - Cloud Storage read/write/delete (for `clear_all_documents.py`)

To download credentials:
1. Go to [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Select your service account (e.g., `firebase-adminsdk-*`)
3. Keys → Add Key → Create new key → JSON
4. Save as `service-account.json` in the project root

### 2. Python Virtual Environment

```bash
cd python_utilities
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Verify Setup

```bash
# With venv activated:
python -c "from google.cloud import firestore; print('Firestore OK')"
```

## Authentication Method

These utilities use **service account authentication**, not gcloud ADC:

```python
# How authentication works in these scripts:
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "path/to/service-account.json"
```

**Why service account instead of gcloud ADC?**
- Service account has project context built-in
- No need to configure quota projects
- Same credentials used in local development and CI/CD
- Matches how Cloud Functions authenticate

**Alternative: gcloud ADC** (more setup required):
```bash
# Would require these additional steps:
gcloud auth application-default login
gcloud auth application-default set-quota-project analog-fusion-knowledge-system
```

## Available Utilities

### reset_embeddings.py

Clears existing embeddings and resets documents to `metadata_ready` status. Use this when:
- Upgrading to a new embedding model
- Changing embedding dimensions
- Regenerating embeddings after content field changes

```bash
# Dry run (shows what would be reset, no changes made)
python reset_embeddings.py

# Actually reset embeddings
python reset_embeddings.py --execute

# Reset only a specific collection
python reset_embeddings.py --execute --collection products_and_datasheets
```

**Output:**
```
============================================================
Embedding Reset Utility
============================================================
Project: analog-fusion-knowledge-system
Database: test
Mode: EXECUTE

Processing collection: products_and_datasheets
--------------------------------------------------
  Found 2 document(s) with embeddings

  Document: Gkozir98eMUXxaZWKJ6a
    Model: gemini-embedding-001
    Embedded: 2026-01-19T19:32:09.144631Z
  Reset: products_and_datasheets_documents/Gkozir98eMUXxaZWKJ6a
...
```

### direct_embedding_update.py

Generates new embeddings using Vertex AI and updates Firestore directly. This bypasses Cloud Functions for simpler local execution.

```bash
# Process all collections
python direct_embedding_update.py
```

**Current Configuration:**
- Model: `gemini-embedding-001`
- Dimensions: 2048
- Task Type: `RETRIEVAL_DOCUMENT` (for corpus documents)

**Output:**
```
============================================================
Direct Embedding Update Utility
============================================================
Project: analog-fusion-knowledge-system
Model: gemini-embedding-001
Dimensions: 2048

Processing collection: ic_design_engineering
--------------------------------------------------
  Found 1 document(s) to process

  Processing: IjbsNRNOop6EQ5TJln75
    Text preview: This document is a training guide...
    Generated embedding: 2048 dimensions
    Updated successfully
...
```

### regenerate_embeddings.py

Triggers the Cloud Function to generate embeddings. Requires proper Cloud Function authentication (more complex setup).

```bash
# Process all collections (calls Cloud Function)
python regenerate_embeddings.py

# Limit documents per collection
python regenerate_embeddings.py --limit 10

# Specific collection only
python regenerate_embeddings.py --collection products_and_datasheets
```

**Note:** This utility requires Cloud Function invoker permissions. For simpler local execution, use `direct_embedding_update.py` instead.

### clear_all_documents.py

Deletes all documents from Firestore collections AND their associated PDF files from Cloud Storage. Collection schemas are preserved. Use this when you want to start fresh with new test documents.

```bash
# Dry run (shows what would be deleted, no changes made)
python clear_all_documents.py

# Actually delete documents and storage files
python clear_all_documents.py --execute

# Clear only a specific collection
python clear_all_documents.py --execute --collection products_and_datasheets
```

**Output:**
```
============================================================
Clear All Documents Utility
============================================================
Project: analog-fusion-knowledge-system
Database: test
Storage Bucket: analog-fusion-knowledge-system-documents
Mode: EXECUTE (will delete!)

Collection: products_and_datasheets
--------------------------------------------------
  - Gkozir98eMUXxaZWKJ6a
    Storage: documents/products_and_datasheets/1768763922867_ACS37630-Datasheet.pdf
    [DELETED] Storage file
    [DELETED] Firestore document
...
```

**What gets deleted:**
- All documents in `{collectionId}_documents` Firestore collections
- Associated PDF files in Cloud Storage (`documents/{collectionId}/...`)

**Note:** Element subcollections (`{collectionId}_documents/{docId}/elements/`) are **not** automatically deleted when parent documents are deleted (Firestore doesn't cascade delete subcollections). However, orphaned elements won't affect functionality and will be replaced when documents are re-uploaded.

**What is preserved:**
- Collection schemas in `_system/config/schemas`
- Vector indexes (no need to recreate)

## Workflow: Upgrading Embeddings

Complete workflow for upgrading from one embedding model/dimension to another:

### Step 1: Reset existing embeddings

```bash
cd python_utilities
source venv/bin/activate

# Preview what will be reset
python reset_embeddings.py

# Execute the reset
python reset_embeddings.py --execute
```

### Step 2: Delete old vector indexes

```bash
# List existing indexes
gcloud firestore indexes composite list \
  --database=test \
  --project=analog-fusion-knowledge-system

# Delete each old index (replace INDEX_ID)
gcloud firestore indexes composite delete INDEX_ID \
  --database=test \
  --project=analog-fusion-knowledge-system \
  --quiet
```

### Step 3: Generate new embeddings

```bash
python direct_embedding_update.py
```

### Step 4: Create new vector indexes

```bash
# For each collection (replace COLLECTION_DOCUMENTS and DIMENSION):
gcloud firestore indexes composite create \
  --collection-group=COLLECTION_DOCUMENTS \
  --query-scope=COLLECTION \
  --field-config='field-path=contentEmbedding.vector,vector-config={"dimension":"DIMENSION","flat":"{}"}' \
  --database=test \
  --project=analog-fusion-knowledge-system
```

### Step 5: Verify indexes are ready

```bash
gcloud firestore indexes composite list \
  --database=test \
  --project=analog-fusion-knowledge-system
```

Wait until STATE shows `READY` for all indexes.

## Troubleshooting

### ModuleNotFoundError: No module named 'google'

Ensure you've activated the virtual environment:
```bash
source venv/bin/activate
```

### Service account file not found

Ensure `service-account.json` exists in the project root (one level up from `python_utilities/`).

### Permission denied errors

Verify your service account has the required IAM roles:
- `roles/datastore.user`
- `roles/aiplatform.user`

### Embedding generation fails with quota error

The service account must have Vertex AI API enabled in the project:
```bash
gcloud services enable aiplatform.googleapis.com --project=analog-fusion-knowledge-system
```

## Configuration

Edit the constants at the top of each script to customize:

```python
# direct_embedding_update.py
PROJECT_ID = "analog-fusion-knowledge-system"
LOCATION = "us-central1"
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 2048
```
