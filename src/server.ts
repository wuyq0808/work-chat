import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { SlackOAuthService } from './services/slackOAuthService.js';
import { AzureOAuthService } from './services/azureOAuthService.js';
import { AtlassianOAuthService } from './services/atlassianOAuthService.js';
import { SlackStreamableMCPServer } from './mcp-servers/slack/slack-mcp-server-http.js';
import { AzureStreamableMCPServer } from './mcp-servers/azure/azure-mcp-server-http.js';
import { AtlassianStreamableMCPServer } from './mcp-servers/atlassian/atlassian-mcp-server-http.js';
import {
  verifyBearerToken,
  getSlackTokenFromCookie,
  getAccessTokenFromAuthHeader,
  getAzureTokenFromCookie,
  getAtlassianTokenFromCookie,
} from './utils/auth.js';
import { errorHandler, asyncHandler } from './middleware/errorHandler.js';
import { callAI, type AIProvider } from './services/llmService.js';
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
app.get(
  '/',
  asyncHandler(async (req, res) => {
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

    // Check and refresh Atlassian token if needed
    try {
      const accessToken = req.cookies.atlassian_token;
      const refreshToken = req.cookies.atlassian_refresh_token;

      // If we have a refresh token but no access token (expired), try to refresh
      if (refreshToken && !accessToken) {
        try {
          const tokenResponse =
            await atlassianOAuthService.refreshToken(refreshToken);

          // Set new cookies
          const isProduction = process.env.NODE_ENV === 'production';
          const cookies = [
            `atlassian_token=${encodeURIComponent(tokenResponse.access_token)}; HttpOnly; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=${tokenResponse.expires_in}; Path=/`,
          ];

          // Update refresh token if provided
          if (tokenResponse.refresh_token) {
            cookies.push(
              `atlassian_refresh_token=${encodeURIComponent(tokenResponse.refresh_token)}; HttpOnly; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=2592000; Path=/`
            );
          }

          res.setHeader('Set-Cookie', cookies);
        } catch (error) {
          console.warn('Failed to refresh Atlassian token:', error);
          // Continue serving the page even if refresh fails
        }
      }
    } catch (error) {
      console.warn('Error checking Atlassian token:', error);
      // Continue serving the page even if token check fails
    }

    res.sendFile(path.join(__dirname, '../public/index.html'));
  })
);

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
