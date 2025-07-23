import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { SlackOAuthService } from './services/slackOAuthService.js';
import { AzureOAuthService } from './services/azureOAuthService.js';
import { AtlassianOAuthService } from './services/atlassianOAuthService.js';
import {
  getSlackTokenFromCookie,
  getAzureTokenFromCookie,
  getAtlassianTokenFromCookie,
  getAzureUserNameFromCookie,
  getSlackUserIdFromCookie,
} from './utils/auth.js';
import { errorHandler, asyncHandler } from './middleware/errorHandler.js';
import { callAIWithStream, type AIProvider } from './services/llmService.js';
import { setAtlassianCookies } from './utils/cookie-utils.js';

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

// Homepage route
app.get(
  '/',
  asyncHandler(async (req, res) => {
    // Check and refresh Atlassian token if needed
    const accessToken = req.cookies.atlassian_token;
    const refreshToken = req.cookies.atlassian_refresh_token;

    // If we have a refresh token but no access token (expired), try to refresh
    if (refreshToken && !accessToken) {
      const tokenResponse =
        await atlassianOAuthService.refreshToken(refreshToken);

      // Set new cookies using utility function
      const isProduction = process.env.NODE_ENV === 'production';
      const cookies = setAtlassianCookies(tokenResponse, isProduction);

      res.setHeader('Set-Cookie', cookies);
    }

    res.sendFile(path.join(__dirname, '../public/index.html'));
  })
);

// AI API endpoint with Server-Sent Events (SSE) for streaming progress
app.post(
  '/api/ai/stream',
  asyncHandler(async (req, res) => {
    const { input, provider, conversationId } = req.body;

    if (!input) {
      return res.status(400).json({
        error: 'Input text is required',
      });
    }

    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    });

    // Get tokens from cookies
    let slackToken: string | undefined;
    let azureToken: string | undefined;
    let atlassianToken: string | undefined;

    slackToken = getSlackTokenFromCookie(req) || undefined;

    azureToken = getAzureTokenFromCookie(req) || undefined;

    atlassianToken = getAtlassianTokenFromCookie(req) || undefined;

    // Extract user names from cookies
    const azureName = getAzureUserNameFromCookie(req);
    const slackUserId = getSlackUserIdFromCookie(req);

    // Progress callback function
    const onProgress = (event: { type: string; data: any }) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const output = await callAIWithStream({
      input,
      slackToken,
      azureToken,
      atlassianToken,
      azureName,
      slackUserId,
      provider: provider as AIProvider,
      conversationId,
      onProgress,
    });

    // Send final response
    res.write(
      `data: ${JSON.stringify({ type: 'complete', data: output })}\n\n`
    );
    res.end();
  })
);

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
