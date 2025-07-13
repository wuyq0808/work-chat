# GitHub Secrets Setup for Google Cloud Run Deployment

To deploy to Google Cloud Run using GitHub Actions, you need to configure the following secrets in your GitHub repository:

## Required GitHub Secrets

1. **GCP_PROJECT_ID**
   - Your Google Cloud Project ID
   - Find it in the Google Cloud Console or run: `gcloud config get-value project`

2. **WIF_PROVIDER**
   - Workload Identity Federation provider
   - Format: `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_NAME/providers/PROVIDER_NAME`

3. **WIF_SERVICE_ACCOUNT**
   - Service account email for Workload Identity Federation
   - Format: `SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com`

## Setup Instructions

### 1. Enable Required APIs
```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable iamcredentials.googleapis.com
```

### 2. Create a Service Account
```bash
export PROJECT_ID=$(gcloud config get-value project)
export SERVICE_ACCOUNT_NAME="github-actions-deploy"

gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
  --display-name="GitHub Actions Deploy Account"
```

### 3. Grant Necessary Permissions
```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### 4. Set up Workload Identity Federation
```bash
export WORKLOAD_IDENTITY_POOL="github-actions-pool"
export WORKLOAD_IDENTITY_PROVIDER="github-provider"
export GITHUB_REPO="wuyq0808/slack-assistant"

# Create Workload Identity Pool
gcloud iam workload-identity-pools create $WORKLOAD_IDENTITY_POOL \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create Workload Identity Provider
gcloud iam workload-identity-pools providers create-oidc $WORKLOAD_IDENTITY_PROVIDER \
  --location="global" \
  --workload-identity-pool=$WORKLOAD_IDENTITY_POOL \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --display-name="GitHub Provider"

# Get the Workload Identity Pool ID
export WORKLOAD_IDENTITY_POOL_ID=$(gcloud iam workload-identity-pools describe $WORKLOAD_IDENTITY_POOL \
  --location="global" \
  --format="value(name)")

# Allow the service account to be impersonated by GitHub Actions
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com \
  --member="principalSet://iam.googleapis.com/$WORKLOAD_IDENTITY_POOL_ID/attribute.repository/$GITHUB_REPO" \
  --role="roles/iam.workloadIdentityUser"
```

### 5. Get the Values for GitHub Secrets
```bash
# Get Project ID
echo "GCP_PROJECT_ID: $PROJECT_ID"

# Get WIF Provider
echo "WIF_PROVIDER: $WORKLOAD_IDENTITY_POOL_ID/providers/$WORKLOAD_IDENTITY_PROVIDER"

# Get Service Account Email
echo "WIF_SERVICE_ACCOUNT: $SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com"
```

### 6. Add Secrets to GitHub
1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each secret with the values from step 5

## Environment Variables in Cloud Run

The workflow sets `NODE_ENV=production` by default. To add more environment variables:

1. Add them to the GitHub workflow file in the deploy step:
   ```yaml
   --set-env-vars="NODE_ENV=production,YOUR_VAR=value"
   ```

2. Or use Google Cloud Secret Manager for sensitive values:
   ```yaml
   --set-secrets="API_KEY=api-key-secret:latest"
   ```

## Customization

You can modify the deployment settings in `.github/workflows/deploy-to-cloud-run.yml`:
- `REGION`: Change the deployment region (default: us-central1)
- `SERVICE_NAME`: Change the Cloud Run service name (default: slack-assistant)
- Memory, CPU, and instance limits can be adjusted in the deploy step