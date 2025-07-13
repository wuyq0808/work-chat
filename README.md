# Slack MCP Server

A Model Context Protocol (MCP) server for Slack integration, providing AI assistants with direct access to Slack channels and conversations.

## Features

- 🔗 **MCP HTTP Server** - Standards-compliant Model Context Protocol implementation
- 💬 **Slack Integration** - Access channels, conversation history, and user data  
- 🔐 **Bearer Token Auth** - Simple HTTP authentication with environment variables
- ⚡ **Performance Caching** - Local caching for users and channels data
- 🛠️ **TypeScript** - Full type safety and modern development experience
- 🌐 **Express.js Backend** - Reliable HTTP server with JSON-RPC 2.0 support

## Getting Started

### Prerequisites

- Node.js 18+ 
- A Slack workspace with user token access

### Installation

1. Clone the repository:
```bash
git clone https://github.com/wuyq0808/slack-assistent.git
cd slack-assistent
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Slack API Configuration
SLACK_USER_TOKEN=xoxp-your-slack-user-token
SLACK_BOT_TOKEN=xoxb-your-bot-token  # Optional

# MCP Authentication
API_KEY=your-secret-api-key

# Optional Settings
SLACK_ADD_MESSAGE_ENABLED=false
SLACK_ALLOWED_CHANNELS=C1234567890,C0987654321
```

### Development

Start the development server:

```bash
npm run dev
```

The server will be available at `http://localhost:5173`:
- Homepage: `http://localhost:5173`
- MCP Endpoint: `http://localhost:5173/api/mcp`

## MCP Tools

The server provides these MCP tools for AI assistants:

### `channels_list`
List all accessible Slack channels.

**Parameters:** None

**Returns:** CSV format with channel ID, name, privacy status, and membership

### `conversations_history`
Get conversation history from a Slack channel.

**Parameters:**
- `channel_id` (required): Channel ID or name (e.g., "C1234567890" or "#general")
- `limit` (optional): Number of messages to retrieve (default: 10)

**Returns:** CSV format with username, message text, and timestamp

## Claude Code Integration

Add this server to Claude Code using the CLI:

```bash
claude mcp add slack-assistant "http://localhost:5173/api/mcp" --transport http --header "Authorization: Bearer your-secret-api-key"
```

Or manually add to your MCP configuration:

```json
{
  "mcpServers": {
    "slack-assistant": {
      "url": "http://localhost:5173/api/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer your-secret-api-key"
      }
    }
  }
}
```

## API Testing

Test the MCP server directly with curl:

```bash
# List available tools
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-api-key" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}' \
  http://localhost:5173/api/mcp

# Get channel list
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-api-key" \
  -d '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"channels_list","arguments":{}}}' \
  http://localhost:5173/api/mcp

# Get conversation history
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-api-key" \
  -d '{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"conversations_history","arguments":{"channel_id":"#general","limit":5}}}' \
  http://localhost:5173/api/mcp
```

## Building for Production

Build the TypeScript code:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## Project Structure

```
├── src/
│   ├── server.ts           # Express.js MCP server
│   └── lib/
│       └── slack-client.ts # Slack API integration
├── public/
│   └── index.html          # Simple welcome page  
├── .env                    # Environment configuration
├── .cache/                 # Cached Slack data (auto-generated)
└── package.json
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_USER_TOKEN` | ✅ | Slack user OAuth token (xoxp-...) |
| `SLACK_BOT_TOKEN` | ❌ | Slack bot token (xoxb-...) |
| `API_KEY` | ✅ | Bearer token for MCP authentication |
| `SLACK_ADD_MESSAGE_ENABLED` | ❌ | Enable message posting (default: false) |
| `SLACK_ALLOWED_CHANNELS` | ❌ | Comma-separated list of allowed channels |
| `PORT` | ❌ | Server port (default: 5173) |

## Troubleshooting

### Authentication Issues
- Ensure your `SLACK_USER_TOKEN` has the required scopes
- Verify the `API_KEY` matches your MCP client configuration

### Cache Issues
- Delete `.cache/` directory to refresh Slack data
- Check Slack API rate limits if requests are failing

### Connection Issues
- Verify the server is running on the correct port
- Check firewall settings for local development

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ for AI-powered Slack integration.