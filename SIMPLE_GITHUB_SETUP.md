# Simple GitHub Setup with Service Account Key

This is a simpler setup using a service account key instead of Workload Identity Federation.

## Steps to Set Up

### 1. Create Service Account Key
```bash
# Create a key for your existing service account
gcloud iam service-accounts keys create key.json \
  --iam-account=slack-assistant@yongqiwu22.iam.gserviceaccount.com
```

### 2. Add to GitHub Secrets

1. **Copy the contents of key.json**:
   ```bash
   cat key.json
   ```

2. **Add to GitHub**:
   - Go to your GitHub repository: https://github.com/wuyq0808/slack-assistant
   - Navigate to Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `GCP_SA_KEY`
   - Value: Paste the entire contents of key.json
   - Click "Add secret"

3. **Add Project ID**:
   - Click "New repository secret" again
   - Name: `GCP_PROJECT_ID`
   - Value: `yongqiwu22`
   - Click "Add secret"

### 3. Delete the Local Key File
**IMPORTANT**: For security, delete the key file after adding it to GitHub:
```bash
rm key.json
```

## That's it!

Your GitHub Actions workflow is now configured to deploy to Google Cloud Run. When you push to the main branch, it will:
1. Build your Docker image
2. Push it to Google Container Registry
3. Deploy it to Cloud Run

## Security Note

Service account keys are credentials that should be kept secure. GitHub encrypts secrets, but for production use, consider:
- Rotating keys periodically
- Using Workload Identity Federation for keyless authentication (more complex but more secure)
- Limiting the service account permissions to only what's needed