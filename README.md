# Work Chat

An AI assistant that helps you find information across Slack, Azure, and Atlassian services through chat.

## Features

- 💬 **Slack Integration** - Access channels, messages, and search
- 🔗 **Azure Integration** - Access emails and calendar
- 📝 **Atlassian Integration** - Access Jira and Confluence
- 🔐 **Secure Authentication** - OAuth for all services

## Prerequisites

### AWS Authentication
For AWS Bedrock (Claude) integration, you need AWS authentication:

```bash
mshell_login_and_set_env() {
    SAML_CMD="saml2aws script --profile default"
    eval $SAML_CMD > /dev/null
    if [ $? -ne 0 ]; then
        echo "saml2aws failed, attempting mshell login..."
        mshell login
    fi
    $(eval $SAML_CMD)
}

# Run before using the assistant:
mshell_login_and_set_env
```

## Quick Start

```bash
git clone https://github.com/wuyq0808/work-chat.git
cd work-chat
npm install
cp .env.example .env
```

**Fill in the secrets in `.env`**

```bash
npm run dev
# Runs at http://localhost:3000
```
