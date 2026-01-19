# Python Utilities

Command-line tools for managing the Firestore document search system.

## Setup

These utilities use the Cloud Functions virtual environment:

```bash
cd admin_site/functions

# Create venv if it doesn't exist
python3.11 -m venv venv
./venv/bin/pip install -r requirements.txt
```

## Authentication

The utilities use your **gcloud application default credentials** (not the service account):

```bash
# Login with your Google account
gcloud auth application-default login

# Set your project
gcloud config set project analog-fusion-knowledge-system
```

This gives you full admin access for index management and debugging.

---

## Available Utilities

### manage_indexes.py

Manage Firestore vector indexes and debug documents.

```bash
cd admin_site/functions
./venv/bin/python ../python_utilities/manage_indexes.py <command>
```

#### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `list` | List all composite indexes | `./venv/bin/python ../python_utilities/manage_indexes.py list` |
| `create <collection>` | Create vector index for a collection | `./venv/bin/python ../python_utilities/manage_indexes.py create products_and_datasheets` |
| `create-all` | Create indexes for all 6 predefined collections | `./venv/bin/python ../python_utilities/manage_indexes.py create-all` |
| `check <collection>` | Check document statuses and embeddings | `./venv/bin/python ../python_utilities/manage_indexes.py check products_and_datasheets` |
| `reset <collection>` | Reset error documents to pending | `./venv/bin/python ../python_utilities/manage_indexes.py reset products_and_datasheets` |

#### Examples

**List all indexes and their status:**
```bash
./venv/bin/python ../python_utilities/manage_indexes.py list
```
Output:
```
Collection: products_and_datasheets_documents
  State: READY
  Fields: contentEmbedding.vector (vector:2048)
```

**Check documents in a collection:**
```bash
./venv/bin/python ../python_utilities/manage_indexes.py check products_and_datasheets
```
Output:
```
Documents in products_and_datasheets_documents:

  abc123
    File: ACS37630-Datasheet.pdf
    Status: ready
    Embedding: 2048 dimensions
```

**Reset stuck documents:**
```bash
./venv/bin/python ../python_utilities/manage_indexes.py reset products_and_datasheets
```
Output:
```
Reset 2 documents to 'pending' status in products_and_datasheets_documents
```

---

## Configuration

The utilities use hardcoded configuration at the top of each script:

```python
# manage_indexes.py
PROJECT_ID = "analog-fusion-knowledge-system"
DATABASE_ID = "test"
EMBEDDING_DIMENSION = 2048
EMBEDDING_FIELD = "contentEmbedding.vector"
```

To use with a different project, edit these values or set environment variables (future enhancement).

---

## Predefined Collections

The `create-all` command creates indexes for these collections:

| Collection ID | Purpose |
|--------------|---------|
| `human_resources_all` | HR policies, benefits, employee handbook |
| `ic_process_engineering` | Semiconductor fabrication processes |
| `ic_design_engineering` | IC design specs, layout guidelines |
| `products_and_datasheets` | Product datasheets, specifications |
| `etq_specifications` | Quality management documents |
| `functional_safety` | Safety standards, compliance docs |

---

## Troubleshooting

### "Permission denied" when creating indexes
You need Owner or Editor role on the project. The service account doesn't have index admin permissions.

Solution: Use `gcloud auth application-default login` with your personal account.

### "quota exceeded" warning
This is a warning about using personal credentials without a quota project. It's usually safe to ignore for low-volume admin tasks.

To fix:
```bash
gcloud auth application-default set-quota-project analog-fusion-knowledge-system
```

### Index stuck in "CREATING" state
Large collections (>10K documents) can take 10-30 minutes to index. Check status with:
```bash
./venv/bin/python ../python_utilities/manage_indexes.py list
```

### Documents not appearing in search
1. Check document status: `./venv/bin/python ../python_utilities/manage_indexes.py check <collection>`
2. Ensure status is `ready` and embedding exists
3. Verify index is `READY` not `CREATING`
