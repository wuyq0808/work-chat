import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import type { ProgressCallback } from './types/progress.js';
import {
  loadAppConfigWithFallbacks,
  getSlackConfig,
  getAzureConfig,
  getAtlassianConfig,
  getGitHubConfig,
  getAWSConfig,
} from './utils/secrets-manager.js';
import { SlackOAuthService } from './oauth/slackOAuthService.js';
import { AzureOAuthService } from './oauth/azureOAuthService.js';
import { AtlassianOAuthService } from './oauth/atlassianOAuthService.js';
import { GitHubOAuthService } from './oauth/githubOAuthService.js';
import {
  getSlackTokenFromCookie,
  getAzureTokenFromCookie,
  getAtlassianTokenFromCookie,
  getGitHubTokenFromCookie,
  getAzureUserNameFromCookie,
  getSlackUserIdFromCookie,
} from './utils/auth.js';
import { errorHandler, asyncHandler } from './middleware/errorHandler.js';
import { handleChatRequest } from './llm/llm-router.js';
import {
  refreshAtlassianToken,
  refreshAzureToken,
} from './utils/cookie-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());

// Routes will be set up after services are initialized in startServer()

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize secrets and start server
async function startServer() {
  // Load configuration with comprehensive fallbacks
  const appConfig = await loadAppConfigWithFallbacks();

  // Initialize OAuth services with grouped configuration (now as local variables)
  const slackOAuthService = new SlackOAuthService(getSlackConfig(appConfig));
  const azureOAuthService = new AzureOAuthService(getAzureConfig(appConfig));
  const atlassianOAuthService = new AtlassianOAuthService(
    getAtlassianConfig(appConfig)
  );
  const githubOAuthService = new GitHubOAuthService(getGitHubConfig(appConfig));

  // Homepage route (moved here to access local OAuth services)
  app.get(
    '/',
    asyncHandler(async (req, res) => {
      // Check and refresh tokens if needed
      const isSecureCookie = process.env.NODE_ENV === 'production';
      await refreshAtlassianToken(
        req,
        res,
        atlassianOAuthService,
        isSecureCookie
      );
      await refreshAzureToken(req, res, azureOAuthService, isSecureCookie);

      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(__dirname, '../public/index.html'));
    })
  );

  // AI API endpoint with Server-Sent Events (SSE) for streaming progress
  app.post(
    '/api/ai/stream',
    asyncHandler(async (req, res) => {
      const { input, provider, conversationId, timezone } = req.body;

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
      let githubToken: string | undefined;

      slackToken = getSlackTokenFromCookie(req) || undefined;

      azureToken = getAzureTokenFromCookie(req) || undefined;

      atlassianToken = getAtlassianTokenFromCookie(req) || undefined;

      githubToken = getGitHubTokenFromCookie(req) || undefined;

      // Extract user names from cookies
      const azureName = getAzureUserNameFromCookie(req);
      const slackUserId = getSlackUserIdFromCookie(req);

      // Progress callback function
      const onProgress: ProgressCallback = event => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const output = await handleChatRequest(
        {
          input,
          provider,
          conversationId,
          timezone,
          onProgress,
          oauthCredentials: {
            slackToken,
            azureToken,
            atlassianToken,
            githubToken,
            azureName,
            slackUserId,
          },
        },
        getAWSConfig(appConfig)
      );

      // Send final response
      res.write(
        `data: ${JSON.stringify({ type: 'complete', data: output })}\n\n`
      );
      res.end();
    })
  );

  // Set up OAuth routes after services are initialized
  app.get('/slack/install', slackOAuthService.handleInstall);
  app.get('/slack/oauth_redirect', slackOAuthService.handleCallback);

  app.get('/azure/install', azureOAuthService.handleInstall);
  app.get('/azure/oauth_redirect', azureOAuthService.handleCallback);

  app.get('/atlassian/install', atlassianOAuthService.handleInstall);
  app.get('/atlassian/oauth_redirect', atlassianOAuthService.handleCallback);

  app.get('/github/install', githubOAuthService.handleInstall);
  app.get('/github/oauth_redirect', githubOAuthService.handleCallback);

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
