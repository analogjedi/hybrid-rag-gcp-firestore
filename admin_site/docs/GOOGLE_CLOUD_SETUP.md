# Google Cloud Setup Guide

Complete setup instructions for the Document Search Admin system with Firestore vector embeddings, Vertex AI Gemini, and Cloud Functions.

## Overview

This system requires the following Google Cloud services:
- **Firestore** - Document database with vector search
- **Cloud Storage** - PDF file storage
- **Vertex AI** - Gemini for document analysis + text embeddings
- **Cloud Functions** - Serverless document processing
- **Cloud Build** - Function deployment (auto-enabled)

## Prerequisites

- Google Cloud account with billing enabled
- `gcloud` CLI installed and authenticated
- `firebase` CLI installed
- Node.js 18+ and Python 3.11+

---

## Step 1: Create Google Cloud Project

### Option A: Via Console
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click "Select a project" → "New Project"
3. Enter project name and create
4. Note the **Project ID** (e.g., `my-project-123`)

### Option B: Via CLI
```bash
gcloud projects create my-project-id --name="My Project Name"
gcloud config set project my-project-id
```

---

## Step 2: Enable Billing

Vector search and Vertex AI require a billing account.

1. Go to [Billing](https://console.cloud.google.com/billing)
2. Link your project to a billing account

---

## Step 3: Create Firestore Database

### Important: Choose the Right Mode and Location

1. Go to [Firestore Console](https://console.cloud.google.com/firestore)
2. Click "Create Database"
3. Choose **Native mode** (NOT Datastore mode)
4. Select a location:
   - `nam5` (US multi-region) - Enterprise edition, best availability
   - `us-central1` (single region) - Standard, lower cost
5. **Note your Database ID** - default is `(default)`, but you can create named databases

### For Non-Default Database
If using a named database (e.g., `test`):
```bash
# List databases
gcloud firestore databases list --project=YOUR_PROJECT_ID

# Your database ID will be shown (e.g., "test" or "(default)")
```

### ⚠️ Firestore Enterprise Limitations
Multi-region databases (like `nam5`) use Firestore Enterprise which has some limitations:
- **Firestore triggers don't work with non-default databases** in Enterprise mode
- Solution: Use HTTP-callable Cloud Functions instead of triggers

---

## Step 4: Create Cloud Storage Bucket

1. Go to [Cloud Storage](https://console.cloud.google.com/storage)
2. Click "Create Bucket"
3. Name it (e.g., `my-project-documents`)
4. Choose same region as Firestore for best performance
5. Use default settings for other options

```bash
# Or via CLI
gsutil mb -l us-central1 gs://my-project-documents
```

---

## Step 5: Enable Required APIs

Enable all required APIs:

```bash
PROJECT_ID=your-project-id

# Core APIs
gcloud services enable firestore.googleapis.com --project=$PROJECT_ID
gcloud services enable storage.googleapis.com --project=$PROJECT_ID

# Vertex AI (for Gemini + Embeddings)
gcloud services enable aiplatform.googleapis.com --project=$PROJECT_ID

# Cloud Functions
gcloud services enable cloudfunctions.googleapis.com --project=$PROJECT_ID
gcloud services enable cloudbuild.googleapis.com --project=$PROJECT_ID
gcloud services enable run.googleapis.com --project=$PROJECT_ID
gcloud services enable eventarc.googleapis.com --project=$PROJECT_ID
gcloud services enable artifactregistry.googleapis.com --project=$PROJECT_ID
```

### Or enable via Console
- [Vertex AI API](https://console.cloud.google.com/apis/api/aiplatform.googleapis.com)
- [Cloud Functions API](https://console.cloud.google.com/apis/api/cloudfunctions.googleapis.com)
- [Cloud Build API](https://console.cloud.google.com/apis/api/cloudbuild.googleapis.com)

### ⚠️ Wait for Service Agents
After enabling Vertex AI, **wait 2-5 minutes** for service agents to be provisioned. These are needed for Vertex AI to read files from Cloud Storage.

---

## Step 6: Add Firebase to Project

Firebase CLI requires the project to have Firebase enabled:

```bash
# Check if Firebase is added
firebase projects:list

# If your project isn't listed, add Firebase
firebase projects:addfirebase YOUR_PROJECT_ID

# Set as default project
firebase use YOUR_PROJECT_ID
```

---

## Step 7: Create Service Account

Create a service account for the admin site (Next.js server):

### Via Console
1. Go to [IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Click "Create Service Account"
3. Name: `admin-site-sa`
4. Grant roles:
   - **Cloud Datastore User** - Firestore read/write
   - **Storage Object Admin** - Cloud Storage access
   - **Vertex AI User** - Gemini API access
   - **Service Account Token Creator** - For signed URLs (optional)
5. Click "Done"
6. Click on the service account → "Keys" → "Add Key" → "Create new key" → JSON
7. Save the JSON file securely

### Via CLI
```bash
PROJECT_ID=your-project-id
SA_NAME=admin-site-sa

# Create service account
gcloud iam service-accounts create $SA_NAME \
  --display-name="Admin Site Service Account" \
  --project=$PROJECT_ID

# Grant roles
SA_EMAIL=$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/aiplatform.user"

# Create and download key
gcloud iam service-accounts keys create service-account.json \
  --iam-account=$SA_EMAIL
```

---

## Step 8: Configure Environment Variables

Create `.env.local` in the admin site:

```bash
# Path to service account JSON
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Firebase/GCP Project
FIREBASE_PROJECT_ID=your-project-id

# Firestore Database ID (use "(default)" or your named database)
FIRESTORE_DATABASE_ID=test

# Cloud Storage Bucket
FIREBASE_STORAGE_BUCKET=your-project-documents

# Vertex AI
VERTEX_AI_PROJECT=your-project-id
VERTEX_AI_LOCATION=us-central1

# Optional: Customize models
GEMINI_MODEL=gemini-2.0-flash-001
EMBEDDING_MODEL=gemini-embedding-001
```

---

## Step 9: Vector Indexes (Auto-Created)

Firestore vector search requires indexes for each collection. **Indexes are now automatically created** when you create a new collection via the admin UI.

### Automatic Index Creation

When you create a collection through the UI (Collections → New Collection), the system automatically:
1. Saves the collection schema to Firestore
2. Calls the `create_vector_index` Cloud Function
3. Creates the vector index for the `{collectionId}_documents` collection

### Manual Index Management (Optional)

For troubleshooting or manual control, use the Python utilities:

```bash
cd admin_site/functions

# List all indexes and their status
./venv/bin/python ../python_utilities/manage_indexes.py list

# Create vector index for a specific collection
./venv/bin/python ../python_utilities/manage_indexes.py create products_and_datasheets

# Create indexes for all 6 predefined collections
./venv/bin/python ../python_utilities/manage_indexes.py create-all

# Check document statuses in a collection
./venv/bin/python ../python_utilities/manage_indexes.py check products_and_datasheets
```

### Index Details
- **Field**: `contentEmbedding.vector`
- **Dimension**: 2048 (for gemini-embedding-001)
- **Type**: Flat index (best for <10k documents)
- **Build time**: 1-5 minutes depending on data size
- **Auto-updates**: New documents are automatically indexed once the index exists

---

## Step 10: Deploy Cloud Functions

### Setup Python Environment
```bash
cd admin_site/functions
python3.11 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### Configure Firebase
Create `firebase.json` in admin_site root:
```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "python311",
      "ignore": ["venv", ".git", "*.local"]
    }
  ]
}
```

Create `.firebaserc`:
```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```

### Deploy
```bash
cd admin_site
firebase deploy --only functions
```

### Deployed Functions
| Function | Purpose |
|----------|---------|
| `process_document` | Analyze single document with Gemini |
| `process_pending_documents` | Batch process pending documents |
| `generate_document_embedding` | Generate embedding for one document |
| `generate_embeddings_for_ready_docs` | Batch generate embeddings |
| `classify_and_search` | Agentic query routing + vector search |
| `get_all_collection_stats` | Dashboard statistics |
| `backfill_embeddings` | Backfill missing embeddings |
| `create_vector_index` | Auto-create vector index for new collections |

---

## Step 11: Test the System

### 1. Start the Admin Site
```bash
cd admin_site
npm run dev
```

### 2. Create a Collection
- Go to http://localhost:3000/collections/new
- Select a template or create custom schema

### 3. Upload a Document
- Go to collection → Upload
- Drop a PDF file
- Click "Process" button

### 4. Search
- Go to http://localhost:3000/search
- Enter a natural language query
- Results should appear with relevance scores

---

## Troubleshooting

### "Vertex AI API has not been used in project"
```bash
# Enable the API
gcloud services enable aiplatform.googleapis.com --project=YOUR_PROJECT_ID
# Wait 2-3 minutes for propagation
```

### "Service agents are being provisioned"
After enabling Vertex AI, wait 2-5 minutes for Google to create the internal service agents that allow Vertex AI to access Cloud Storage.

### "No results found" in search
1. Check that documents have `status: ready` and embeddings:
   ```bash
   ./venv/bin/python ../python_utilities/manage_indexes.py check products_and_datasheets
   ```
2. Verify vector index exists and is READY:
   ```bash
   ./venv/bin/python ../python_utilities/manage_indexes.py list
   ```

### "Permission denied" errors
Ensure service account has required roles:
- Cloud Datastore User
- Storage Object Admin
- Vertex AI User

### Cloud Function deployment fails
1. Ensure all APIs are enabled
2. Check that `venv` exists in functions directory
3. Verify Python 3.11 is installed

### Documents stuck in "pending"
Since we use HTTP-callable functions (not triggers), you must manually trigger processing:
- Use the "Process" button in the UI
- Or call the `/api/process` endpoint

---

## Cost Considerations

| Service | Pricing |
|---------|---------|
| Firestore | $0.06/100K reads, $0.18/100K writes |
| Cloud Storage | $0.020/GB/month |
| Vertex AI Gemini | ~$0.00025/1K input tokens |
| Text Embeddings | ~$0.00002/1K characters |
| Cloud Functions | 2M free invocations/month |

For a small deployment (<1000 documents), expect ~$5-20/month.

---

## Security Best Practices

1. **Never commit service account keys** - Add to `.gitignore`
2. **Use least-privilege roles** - Only grant necessary permissions
3. **Enable audit logging** - Monitor API access
4. **Set up budget alerts** - Prevent unexpected charges
5. **Restrict API key usage** - Limit to specific APIs/IPs

---

## Architecture Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Admin Site    │────▶│  Cloud Functions │────▶│   Vertex AI     │
│   (Next.js)     │     │    (Python)      │     │   (Gemini)      │
└────────┬────────┘     └────────┬─────────┘     └─────────────────┘
         │                       │
         │                       ▼
         │              ┌──────────────────┐
         └─────────────▶│    Firestore     │
                        │  (Vector Search) │
                        └────────┬─────────┘
                                 │
                        ┌────────▼─────────┐
                        │  Cloud Storage   │
                        │    (PDFs)        │
                        └──────────────────┘
```

---

## Quick Reference

```bash
# Project setup
gcloud config set project YOUR_PROJECT_ID
firebase use YOUR_PROJECT_ID

# Check services
gcloud services list --enabled --project=YOUR_PROJECT_ID

# Deploy functions
firebase deploy --only functions

# View function logs
firebase functions:log

# List indexes
./venv/bin/python ../python_utilities/manage_indexes.py list

# Reset stuck documents
./venv/bin/python ../python_utilities/manage_indexes.py reset COLLECTION_NAME
```

---

## Local Development Setup

Complete guide for setting up your local development environment.

### 1. Clone and Install Dependencies

```bash
# Clone the repo
cd /path/to/your/projects
git clone <repo-url> firestore_embeddings_reference
cd firestore_embeddings_reference/admin_site

# Install Node.js dependencies
npm install

# Setup Python environment for Cloud Functions
cd functions
python3.11 -m venv venv
./venv/bin/pip install -r requirements.txt
cd ..
```

### 2. Configure gcloud CLI

```bash
# Login to Google Cloud
gcloud auth login

# Set default project
gcloud config set project analog-fusion-knowledge-system

# Setup application default credentials (for Python utilities)
gcloud auth application-default login
```

### 3. Create Environment File

```bash
# Copy the example file
cp .env.local.example .env.local

# Edit with your values
nano .env.local  # or use your preferred editor
```

**Required values:**
```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
FIREBASE_PROJECT_ID=analog-fusion-knowledge-system
FIRESTORE_DATABASE_ID=test
FIREBASE_STORAGE_BUCKET=analog-fusion-knowledge-system-documents
VERTEX_AI_PROJECT=analog-fusion-knowledge-system
VERTEX_AI_LOCATION=us-central1
```

### 4. Verify Service Account

Ensure your service account JSON file:
- Exists at the path specified in `GOOGLE_APPLICATION_CREDENTIALS`
- Has the required IAM roles (see Step 7 above)
- Is NOT committed to git (check `.gitignore`)

### 5. Start Development Server

```bash
cd admin_site
npm run dev
```

Open http://localhost:3000 (or the port shown in terminal).

---

## Python Utilities

Command-line tools for managing the system. Located in `admin_site/python_utilities/`.

### Setup

```bash
# Navigate to functions directory (has the venv)
cd admin_site/functions

# Ensure venv exists
python3.11 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### Authentication

Python utilities use **gcloud application default credentials** (your personal account), not the service account. This gives you admin access for index management.

```bash
gcloud auth application-default login
```

### Available Commands

Run from the `functions` directory:

```bash
# List all Firestore indexes
./venv/bin/python ../python_utilities/manage_indexes.py list

# Create vector index for a collection
./venv/bin/python ../python_utilities/manage_indexes.py create products_and_datasheets

# Create indexes for all 6 predefined collections
./venv/bin/python ../python_utilities/manage_indexes.py create-all

# Check document statuses in a collection
./venv/bin/python ../python_utilities/manage_indexes.py check products_and_datasheets

# Reset error documents to pending status
./venv/bin/python ../python_utilities/manage_indexes.py reset products_and_datasheets
```

### Configuration

Edit the constants at the top of `manage_indexes.py` if using a different project:

```python
PROJECT_ID = "analog-fusion-knowledge-system"
DATABASE_ID = "test"
EMBEDDING_DIMENSION = 2048
EMBEDDING_FIELD = "contentEmbedding.vector"
```

---

## Project Structure

```
firestore_embeddings_reference/
├── service-account.json          # GCP credentials (DO NOT COMMIT)
└── admin_site/
    ├── .env.local                # Local environment config (DO NOT COMMIT)
    ├── .env.local.example        # Template for .env.local
    ├── firebase.json             # Firebase deployment config
    ├── .firebaserc               # Firebase project settings
    ├── package.json              # Node.js dependencies
    │
    ├── app/                      # Next.js pages
    │   ├── api/                  # API routes
    │   │   ├── upload/           # File upload endpoint
    │   │   ├── process/          # Document processing endpoint
    │   │   └── search/           # Search endpoint
    │   ├── collections/          # Collection management pages
    │   └── search/               # Search UI
    │
    ├── components/               # React components
    ├── lib/                      # Shared utilities
    │   └── firebase/             # Firebase Admin SDK wrappers
    │
    ├── functions/                # Cloud Functions (Python)
    │   ├── main.py               # Function definitions
    │   ├── requirements.txt      # Python dependencies
    │   └── venv/                 # Python virtual environment
    │
    ├── python_utilities/         # CLI tools
    │   ├── manage_indexes.py     # Index management
    │   └── README.md             # Utility documentation
    │
    └── docs/                     # Documentation
        └── GOOGLE_CLOUD_SETUP.md # This file
```

---

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | Path to service account JSON | `/path/to/sa.json` |
| `FIREBASE_PROJECT_ID` | Yes | GCP project ID | `my-project-123` |
| `FIRESTORE_DATABASE_ID` | Yes | Firestore database ID | `(default)` or `test` |
| `FIREBASE_STORAGE_BUCKET` | Yes | Cloud Storage bucket | `my-project-docs` |
| `VERTEX_AI_PROJECT` | Yes | Vertex AI project | `my-project-123` |
| `VERTEX_AI_LOCATION` | Yes | Vertex AI region | `us-central1` |
| `GEMINI_MODEL` | No | Gemini model name | `gemini-2.0-flash-001` |
| `EMBEDDING_MODEL` | No | Embedding model | `gemini-embedding-001` |
| `FUNCTIONS_REGION` | No | Cloud Functions region | `us-central1` |

---

## Two Authentication Modes

### 1. Service Account (Admin Site / Cloud Functions)

Used by the Next.js server and Cloud Functions for production operations.

```bash
# Set in .env.local
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

**Required roles:**
- Cloud Datastore User
- Storage Object Admin
- Vertex AI User

### 2. Application Default Credentials (Python Utilities)

Used by CLI tools for admin operations like creating indexes.

```bash
# Login with your personal Google account
gcloud auth application-default login
```

**Required:** Owner or Editor role on the project (your personal account likely has this)
