import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { SlackMCPClient } from './lib/slack-client.js';
// Simple HTTP MCP server - no SDK transport needed

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5173;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Slack client (will be created per request with dynamic token)
let slackClient: SlackMCPClient;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// MCP server info
const SERVER_INFO = {
  name: "slack-mcp-server",
  version: "1.0.0"
};

const CAPABILITIES = {
  tools: {
    listChanged: false
  }
};

const TOOLS = [
  {
    name: "conversations_history",
    description: "Get conversation history from a Slack channel",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { 
          type: "string", 
          description: "Channel ID or name (e.g., #general)" 
        },
        limit: { 
          type: "number", 
          description: "Number of messages (default: 10)" 
        }
      },
      required: ["channel_id"]
    }
  },
  {
    name: "channels_list",
    description: "List all accessible Slack channels",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

// Homepage route with basic URL authentication
app.get('/', (req, res) => {
  const apiKey = process.env.API_KEY;
  const providedApiKey = req.query.apikey as string;
  
  if (!apiKey) {
    console.warn('Warning: API_KEY environment variable not set');
    return res.status(500).send('Server configuration error');
  }
  
  if (providedApiKey !== apiKey) {
    return res.status(401).send(`
      <html>
        <head><title>Access Denied</title></head>
        <body>
          <h1>🔒 Access Denied</h1>
          <p>Invalid API key required in URL.</p>
          <p>Please contact the administrator for access.</p>
        </body>
      </html>
    `);
  }
  
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// OpenAI API endpoint
app.post('/api/openai/generate', async (req, res) => {
  try {
    // Bearer token authentication check
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.API_KEY;
    
    if (!expectedToken) {
      console.warn('Warning: API_KEY environment variable not set');
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Bearer token required'
      });
    }
    
    const token = authHeader.split(' ')[1];
    if (expectedToken && token !== expectedToken) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Invalid token'
      });
    }

    const { input } = req.body;
    
    if (!input) {
      return res.status(400).json({
        error: 'Input text is required'
      });
    }

    // Get Slack user token from header
    const slack_user_token = req.headers['x-slack-user-token'] as string;
    if (!slack_user_token) {
      return res.status(400).json({
        error: 'Slack user token required in X-Slack-User-Token header'
      });
    }

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: input,
      tools: [
        {
          type: "mcp",
          server_label: "slack-mcp",
          server_url: "https://slack-assistant-118769120637.us-central1.run.app/api/mcp",
          headers: {
            Authorization: `Bearer ${process.env.API_KEY}`,
            'X-Slack-User-Token': slack_user_token
          },
          require_approval: "never"
        }
      ]
    });

    res.json({
      success: true,
      output: response.output_text || 'No response generated',
      model: "gpt-4o-mini",
      usage: response.usage
    });

  } catch (error) {
    console.error('OpenAI API error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate response'
    });
  }
});

// No OAuth endpoints - using simple basic auth instead

// MCP HTTP endpoint - handle all MCP requests
app.post('/api/mcp', async (req, res) => {
  try {
    // Bearer token authentication check
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.API_KEY;
    
    if (!expectedToken) {
      console.warn('Warning: API_KEY environment variable not set');
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: {
          code: -32001,
          message: 'Unauthorized - Bearer token required'
        }
      });
    }
    
    const token = authHeader.split(' ')[1];
    if (expectedToken && token !== expectedToken) {
      return res.status(401).json({
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: {
          code: -32001,
          message: 'Unauthorized - Invalid token'
        }
      });
    }

    // Get Slack user token from header
    const slackUserToken = req.headers['x-slack-user-token'] as string;
    if (!slackUserToken) {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: {
          code: -32602,
          message: 'Slack user token required in X-Slack-User-Token header'
        }
      });
    }

    // Create Slack client with dynamic token
    slackClient = new SlackMCPClient({
      botToken: process.env.SLACK_BOT_TOKEN,
      userToken: slackUserToken,
      addMessageToolEnabled: process.env.SLACK_ADD_MESSAGE_ENABLED === 'true',
      allowedChannels: process.env.SLACK_ALLOWED_CHANNELS?.split(',').map(c => c.trim())
    });

    const { jsonrpc, id, method, params } = req.body;

    if (jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32600,
          message: 'Invalid JSON-RPC version'
        }
      });
    }

    let result;

    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: CAPABILITIES,
          serverInfo: SERVER_INFO
        };
        break;

      case 'tools/list':
        result = {
          tools: TOOLS
        };
        break;

      case 'tools/call':
        const { name, arguments: args } = params;
        
        switch (name) {
          case 'conversations_history':
            await slackClient.refreshUsers();
            await slackClient.refreshChannels();
            const historyResult = await slackClient.getConversationHistory({
              channel: args?.channel_id as string,
              limit: (args?.limit as number) || 10
            });
            
            if (historyResult.success && historyResult.data) {
              let content = 'userName,text,time\n';
              historyResult.data.forEach((msg: any) => {
                content += `${msg.userName},${msg.text.replace(/\n/g, ' ')},${msg.time}\n`;
              });
              
              result = {
                content: [
                  {
                    type: "text",
                    text: content
                  }
                ]
              };
            } else {
              throw new Error(historyResult.error || 'Failed to fetch conversation history');
            }
            break;
            
          case 'channels_list':
            await slackClient.refreshChannels();
            const channelsResult = await slackClient.getChannels();
            
            if (channelsResult.success && channelsResult.data) {
              let content = 'id,name,is_private,is_member\n';
              channelsResult.data.forEach((channel: any) => {
                content += `${channel.id},${channel.name || 'unnamed'},${channel.is_private || false},${channel.is_member || false}\n`;
              });
              
              result = {
                content: [
                  {
                    type: "text", 
                    text: content
                  }
                ]
              };
            } else {
              throw new Error(channelsResult.error || 'Failed to fetch channels');
            }
            break;
            
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
        break;

      case 'notifications/initialized':
        // OpenAI sends this notification after initialization
        // Just acknowledge it - no response needed for notifications
        return res.status(200).send();

      default:
        return res.status(400).json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        });
    }

    res.json({
      jsonrpc: '2.0',
      id,
      result
    });

  } catch (error) {
    console.error('MCP request error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error'
      }
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`MCP HTTP endpoint: http://localhost:${port}/api/mcp`);
});