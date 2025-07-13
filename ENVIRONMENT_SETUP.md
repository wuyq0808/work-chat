# Environment Variables Setup for Cloud Run

Your Slack assistant requires the following environment variables. These need to be set up in Google Cloud Secret Manager before deployment.

## Required Secrets

### 1. Slack User Token (Required)
```bash
# Create Slack User Token secret
echo -n "xoxp-your-user-token-here" | gcloud secrets create SLACK_USER_TOKEN --data-file=-
```

### 2. API Authentication (Required)
```bash
# Create API Key for MCP authentication
echo -n "your-secure-api-key-here" | gcloud secrets create API_KEY --data-file=-
```

### 3. Optional Configuration
```bash
# Enable/disable message sending (true/false)
echo -n "false" | gcloud secrets create SLACK_ADD_MESSAGE_ENABLED --data-file=-

# Comma-separated list of allowed channels (optional)
echo -n "#general,#engineering,#support" | gcloud secrets create SLACK_ALLOWED_CHANNELS --data-file=-
```

## Getting Slack User Token

### User Token (xoxp-)
1. Go to https://api.slack.com/apps
2. Create a new app or select your existing app
3. Go to "OAuth & Permissions"
4. Add these User Token Scopes:
   - `channels:history` - View messages in public channels
   - `channels:read` - View basic channel info
   - `groups:history` - View messages in private channels
   - `groups:read` - View basic private channel info
   - `im:history` - View direct messages
   - `mpim:history` - View group direct messages
   - `users:read` - View user info
5. Install the app to your workspace
6. Copy the User OAuth Token

## Generating a Secure API Key

Generate a secure random API key:
```bash
# On macOS/Linux
openssl rand -base64 32

# Or using Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Verifying Secrets

List all created secrets:
```bash
gcloud secrets list
```

## Notes

- The workflow uses Google Cloud Secret Manager to securely store sensitive values
- Secrets are accessed at runtime by Cloud Run
- Never commit these values to your repository
- The `API_KEY` is used to authenticate requests to your MCP server
- Set `SLACK_ADD_MESSAGE_ENABLED` to `true` only if you want to send messages to Slack