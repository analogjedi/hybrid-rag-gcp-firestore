# IAM Requirements

Firebase Cloud Functions (2nd generation) require specific IAM roles for Vertex AI and Firestore access.

## Authentication

Cloud Functions authenticate to Vertex AI using **Application Default Credentials (ADC)**. No API keys or secrets are required - the function's service account automatically has access to Vertex AI within the same GCP project.

## Required Setup

For Eventarc triggers (if using Firestore triggers), you need to grant Eventarc permissions.

### Step 1: Get Your Project Number

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
echo $PROJECT_NUMBER
```

### Step 2: Grant Eventarc Event Receiver

This allows Eventarc to invoke your Cloud Functions:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com" \
  --role="roles/eventarc.eventReceiver" \
  --condition=None
```

### Step 3: Grant Pub/Sub Publisher to Firestore

This allows Firestore to publish events when documents change:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-firestore.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --condition=None
```

## Complete Script

Copy and run this script (replace YOUR_PROJECT_ID):

```bash
#!/bin/bash
PROJECT_ID="YOUR_PROJECT_ID"
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

echo "Setting up IAM for project: $PROJECT_ID (number: $PROJECT_NUMBER)"

# Eventarc Event Receiver
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com" \
  --role="roles/eventarc.eventReceiver" \
  --condition=None

# Pub/Sub Publisher for Firestore
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-firestore.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --condition=None

echo "IAM setup complete!"
```

## Service Accounts Explained

| Service Account | Purpose |
|-----------------|---------|
| `service-{NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com` | Eventarc system SA that delivers events to functions |
| `service-{NUMBER}@gcp-sa-firestore.iam.gserviceaccount.com` | Firestore system SA that publishes change events |

These are Google-managed service accounts that are automatically created for your project.

## Vertex AI Roles

The Cloud Functions service account needs access to Vertex AI. This is typically granted automatically when Vertex AI API is enabled, but you can verify with:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:YOUR_PROJECT_ID@appspot.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

## Troubleshooting

### Error: "Permission denied" on trigger deployment

**Cause:** Missing Eventarc roles.

**Solution:** Run the IAM commands above.

### Error: "Trigger not firing"

**Cause:** Pub/Sub publisher role not granted to Firestore SA.

**Solution:** Run Step 3 above.

### Error: "Vertex AI API not enabled"

**Cause:** Vertex AI API not enabled for the project.

**Solution:**
```bash
gcloud services enable aiplatform.googleapis.com --project=YOUR_PROJECT_ID
```

### Error: "Service account does not exist"

**Cause:** First-time setup, service accounts not yet created.

**Solution:**
1. Deploy any Cloud Function first to create the service accounts
2. Wait a few minutes
3. Retry the IAM commands

## Verify IAM Bindings

Check current IAM bindings:

```bash
gcloud projects get-iam-policy YOUR_PROJECT_ID \
  --flatten="bindings[].members" \
  --format="table(bindings.role,bindings.members)" \
  --filter="bindings.members:gcp-sa-eventarc OR bindings.members:gcp-sa-firestore"
```

Expected output should show:
- `roles/eventarc.eventReceiver` for `@gcp-sa-eventarc.iam.gserviceaccount.com`
- `roles/pubsub.publisher` for `@gcp-sa-firestore.iam.gserviceaccount.com`

## Additional Roles (Optional)

If your functions need additional capabilities:

| Role | When Needed |
|------|-------------|
| `roles/aiplatform.user` | Vertex AI access (embeddings, Gemini) |
| `roles/datastore.user` | Read/write Firestore (usually automatic) |
| `roles/storage.objectAdmin` | Access Cloud Storage |
| `roles/iam.serviceAccountTokenCreator` | Generate signed URLs |

These are granted to the function's runtime service account, not the Eventarc/Firestore system accounts.
