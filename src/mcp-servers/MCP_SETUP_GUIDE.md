# Slack MCP Server Setup

## Prerequisites

1. Build the project: `npm run build`
2. Get your Slack User Token from [Slack API Apps](https://api.slack.com/apps) → OAuth & Permissions

## Configuration

### Claude Code

```bash
claude mcp add slack -e SLACK_USER_TOKEN=xoxp-your-token-here -- /path/to/work-chat/src/mcp-servers/bin/slack-mcp-server
```

## Available Tools

- `slack__conversations_history` - Get channel messages
- `slack__conversations_replies` - Get thread replies  
- `slack__search_messages` - Search workspace messages
- `slack__get_latest_messages` - Get your recent messages