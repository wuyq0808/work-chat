import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { SlackOAuthService } from './services/slackOAuthService.js';
import { AzureOAuthService } from './services/azureOAuthService.js';
import { AtlassianOAuthService } from './services/atlassianOAuthService.js';
import { SlackStreamableMCPServer } from './slack-mcp-server.js';
import { AzureStreamableMCPServer } from './mcp-servers/azure/azure-mcp-server-http.js';
import { AtlassianStreamableMCPServer } from './atlassian-mcp-server.js';
import {
  verifyBearerToken,
  getSlackTokenFromCookie,
  getAccessTokenFromAuthHeader,
  getAzureTokenFromCookie,
  getAtlassianTokenFromCookie,
} from './utils/auth.js';
import { errorHandler, asyncHandler } from './middleware/errorHandler.js';
import { callAI, type AIProvider } from './services/aiService.js';
// Simple HTTP MCP server - no SDK transport needed

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());

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

    // Get tokens from cookies (optional - AI will work with at least one token)
    let slackToken: string | undefined;
    let azureToken: string | undefined;
    let atlassianToken: string | undefined;

    try {
      slackToken = getSlackTokenFromCookie(req);
    } catch {
      // Slack token not available - that's fine if other tokens are available
    }

    try {
      azureToken = getAzureTokenFromCookie(req);
    } catch {
      // Azure token not available - that's fine if other tokens are available
    }

    try {
      atlassianToken = getAtlassianTokenFromCookie(req);
    } catch {
      // Atlassian token not available - that's fine if other tokens are available
    }

    const output = await callAI({
      input,
      slackToken,
      azureToken,
      atlassianToken,
      provider: provider as AIProvider,
    });

    // Check if response starts with "Error:" to determine success
    const isError = output.startsWith('Error:');

    res.json({
      success: !isError,
      output: output,
      error: isError ? output : undefined,
    });
  })
);

// No OAuth endpoints - using simple basic auth instead

// Slack MCP Streamable HTTP endpoint - handles both GET and POST
app.all(
  '/api/slack-mcp',
  asyncHandler(async (req, res) => {
    // Bearer token authentication check
    verifyBearerToken(req);

    // Get Slack user token from auth header (MCP format)
    const slackUserToken = getAccessTokenFromAuthHeader(req);

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

// Azure MCP Streamable HTTP endpoint - handles both GET and POST
app.all(
  '/api/azure-mcp',
  asyncHandler(async (req, res) => {
    // Bearer token authentication check
    verifyBearerToken(req);

    // Get Azure access token from auth header (MCP format)
    const azureAccessToken = getAccessTokenFromAuthHeader(req);

    // Create a new Streamable MCP server instance for this connection
    const streamableServer = new AzureStreamableMCPServer();

    // Initialize Azure client
    streamableServer.initializeAzureClient({
      accessToken: azureAccessToken,
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

// Atlassian MCP Streamable HTTP endpoint - handles both GET and POST
app.all(
  '/api/atlassian-mcp',
  asyncHandler(async (req, res) => {
    // Bearer token authentication check
    verifyBearerToken(req);

    // Get Atlassian access token from auth header (MCP format)
    const atlassianAccessToken = getAccessTokenFromAuthHeader(req);

    // Create a new Streamable MCP server instance for this connection
    const streamableServer = new AtlassianStreamableMCPServer();

    // Initialize Atlassian client
    streamableServer.initializeAtlassianClient({
      accessToken: atlassianAccessToken,
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
  console.log(
    `Slack MCP Streamable HTTP endpoint: http://localhost:${port}/api/slack-mcp`
  );
  console.log(
    `Azure MCP Streamable HTTP endpoint: http://localhost:${port}/api/azure-mcp`
  );
  console.log(
    `Atlassian MCP Streamable HTTP endpoint: http://localhost:${port}/api/atlassian-mcp`
  );
});
