import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { SlackMCPClient } from './lib/slack-client.js';
import { SlackStreamableMCPServer } from './mcp-streamable-server.js';
// Simple HTTP MCP server - no SDK transport needed

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5173;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Slack client (will be created per request with dynamic token)
let slackClient: SlackMCPClient;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

// MCP Streamable HTTP endpoint - handles both GET and POST
app.all('/api/mcp', async (req, res) => {
  try {
    // Bearer token authentication check
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.API_KEY;
    
    if (!expectedToken) {
      console.warn('Warning: API_KEY environment variable not set');
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized - Bearer token required'
      });
    }
    
    const token = authHeader.split(' ')[1];
    if (expectedToken && token !== expectedToken) {
      return res.status(401).json({
        error: 'Unauthorized - Invalid token'
      });
    }

    // Get Slack user token from header
    const slackUserToken = req.headers['x-slack-user-token'] as string;
    if (!slackUserToken) {
      return res.status(400).json({
        error: 'Slack user token required in X-Slack-User-Token header'
      });
    }

    // Create a new Streamable MCP server instance for this connection
    const streamableServer = new SlackStreamableMCPServer();
    
    // Initialize Slack client
    streamableServer.initializeSlackClient({
      botToken: process.env.SLACK_BOT_TOKEN,
      userToken: slackUserToken,
      addMessageToolEnabled: process.env.SLACK_ADD_MESSAGE_ENABLED === 'true',
      allowedChannels: process.env.SLACK_ALLOWED_CHANNELS?.split(',').map(c => c.trim())
    });

    // Create MCP server and transport
    const server = streamableServer.createServer();
    const transport = streamableServer.createTransport();

    // Clean up on request close
    res.on('close', () => {
      transport.close();
      server.close();
    });

    // Connect server to transport and handle the request
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

  } catch (error) {
    console.error('MCP Streamable HTTP error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal error'
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`MCP Streamable HTTP endpoint: http://localhost:${port}/api/mcp`);
});