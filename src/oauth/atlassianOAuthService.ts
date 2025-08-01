import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { setAtlassianCookies } from '../utils/cookie-utils.js';
import type { AtlassianTokenResponse } from '../types/atlassian.js';
import type { AtlassianConfig } from '../utils/secrets-manager.js';

export class AtlassianOAuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private scopes: string[];

  constructor(config: AtlassianConfig) {
    if (
      !config.ATLASSIAN_CLIENT_ID ||
      !config.ATLASSIAN_CLIENT_SECRET ||
      !config.ATLASSIAN_REDIRECT_URI
    ) {
      throw new Error('Missing required Atlassian configuration');
    }

    this.clientId = config.ATLASSIAN_CLIENT_ID;
    this.clientSecret = config.ATLASSIAN_CLIENT_SECRET;
    this.redirectUri = config.ATLASSIAN_REDIRECT_URI;
    this.scopes = [
      'read:me', // Required for user info
      'read:jira-user',
      'read:jira-work',
      'read:confluence-user',
      'read:confluence-content.all',
      'search:confluence', // Search Confluence content and space summaries
      'offline_access', // For refresh tokens
    ];
  }

  private generateAuthorizationUrl(): string {
    const baseUrl = 'https://auth.atlassian.com/authorize';
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: this.clientId,
      scope: this.scopes.join(' '),
      redirect_uri: this.redirectUri,
      state: Math.random().toString(36).substring(2, 15),
      response_type: 'code',
      prompt: 'consent',
    });

    return `${baseUrl}?${params.toString()}`;
  }

  private async exchangeCodeForToken(
    code: string
  ): Promise<AtlassianTokenResponse> {
    const tokenUrl = 'https://auth.atlassian.com/oauth/token';

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
    });

    const response = await globalThis.fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenResponse = (await response.json()) as AtlassianTokenResponse;

    // Validate required fields
    if (!tokenResponse.access_token || !tokenResponse.refresh_token) {
      throw new Error(
        'Atlassian token response missing required fields: access_token or refresh_token'
      );
    }

    return tokenResponse;
  }

  handleInstall = asyncHandler(async (_req: Request, res: Response) => {
    const authUrl = this.generateAuthorizationUrl();
    res.redirect(authUrl);
  });

  handleCallback = asyncHandler(async (req: Request, res: Response) => {
    const { code, error, error_description } = req.query;

    if (error) {
      const htmlResponse = `
        <html>
          <head>
            <title>Atlassian OAuth Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #e01e5a; }
            </style>
          </head>
          <body>
            <h1 class="error">❌ Atlassian OAuth Failed</h1>
            <p>Error: ${error}</p>
            <p>Description: ${error_description || 'Unknown error'}</p>
            <p>Please try again or contact support.</p>
            <a href="/atlassian/install">Try Again</a>
          </body>
        </html>
      `;
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlResponse);
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'No authorization code received' });
      return;
    }

    try {
      const tokenResponse = await this.exchangeCodeForToken(code);

      // Set cookies using utility function
      const isSecureCookie = process.env.NODE_ENV === 'production';
      const cookies = setAtlassianCookies(tokenResponse, isSecureCookie);

      res.setHeader('Set-Cookie', cookies);

      // Redirect to home page
      const redirectUrl = new URL(`${process.env.HOME_PAGE_URL}/`);

      res.writeHead(302, { Location: redirectUrl.toString() });
      res.end();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const htmlResponse = `
        <html>
          <head>
            <title>Atlassian OAuth Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #e01e5a; }
            </style>
          </head>
          <body>
            <h1 class="error">❌ Atlassian OAuth Failed</h1>
            <p>There was an error processing your Atlassian OAuth request.</p>
            <p>Error: ${errorMessage}</p>
            <p>Please try again or contact support.</p>
            <a href="/atlassian/install">Try Again</a>
          </body>
        </html>
      `;
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlResponse);
    }
  });

  async getAccessToken(code: string): Promise<string> {
    const tokenResponse = await this.exchangeCodeForToken(code);
    return tokenResponse.access_token;
  }

  async refreshToken(refreshToken: string): Promise<AtlassianTokenResponse> {
    const tokenUrl = 'https://auth.atlassian.com/oauth/token';

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    });

    const response = await globalThis.fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokenResponse = (await response.json()) as AtlassianTokenResponse;

    // Validate required fields
    if (!tokenResponse.access_token || !tokenResponse.refresh_token) {
      throw new Error(
        'Atlassian refresh token response missing required fields: access_token or refresh_token'
      );
    }

    return tokenResponse;
  }
}
