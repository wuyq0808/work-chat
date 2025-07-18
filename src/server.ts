import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { SlackOAuthService } from './services/slackOAuthService.js';
import { AzureOAuthService } from './services/azureOAuthService.js';
import { AtlassianOAuthService } from './services/atlassianOAuthService.js';
import { SlackStreamableMCPServer } from './mcp-streamable-server.js';
import { verifyBearerToken, getSlackToken } from './utils/auth.js';
import { errorHandler, asyncHandler } from './middleware/errorHandler.js';
import { callAI, type AIProvider } from './services/aiService.js';
// Simple HTTP MCP server - no SDK transport needed

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5173;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize OAuth services
const slackOAuthService = new SlackOAuthService();
const azureOAuthService = new AzureOAuthService();
const atlassianOAuthService = new AtlassianOAuthService();

// Slack OAuth routes
app.get('/slack/install', slackOAuthService.handleInstall);
app.get('/slack/oauth_redirect', slackOAuthService.handleCallback);

// Azure OAuth routes
app.get('/azure/install', azureOAuthService.handleInstall);
app.get('/azure/oauth_redirect', azureOAuthService.handleCallback);

// Atlassian OAuth routes
app.get('/atlassian/install', atlassianOAuthService.handleInstall);
app.get('/atlassian/oauth_redirect', atlassianOAuthService.handleCallback);

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

// AI API endpoint (supports OpenAI and Claude)
app.post(
  '/api/ai/generate',
  asyncHandler(async (req, res) => {
    // Bearer token authentication check
    verifyBearerToken(req);

    const { input, provider } = req.body;

    if (!input) {
      return res.status(400).json({
        error: 'Input text is required',
      });
    }

    // Get Slack user token from header
    const slackToken = getSlackToken(req);

    const response = await callAI({
      input,
      slackToken,
      provider: provider as AIProvider,
    });

    res.json(response);
  })
);

// No OAuth endpoints - using simple basic auth instead

// MCP Streamable HTTP endpoint - handles both GET and POST
app.all(
  '/api/mcp',
  asyncHandler(async (req, res) => {
    // Bearer token authentication check
    verifyBearerToken(req);

    // Get Slack user token from header or URL parameter
    const slackUserToken = getSlackToken(req);

    // Create a new Streamable MCP server instance for this connection
    const streamableServer = new SlackStreamableMCPServer();

    // Initialize Slack client
    streamableServer.initializeSlackClient({
      userToken: slackUserToken,
      addMessageToolEnabled: false,
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
  })
);

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`MCP Streamable HTTP endpoint: http://localhost:${port}/api/mcp`);
});
