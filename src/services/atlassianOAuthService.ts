import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';

interface AtlassianTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface AtlassianUserInfo {
  account_id: string;
  name: string;
  email: string;
  picture?: string;
}

interface AtlassianAccessibleResource {
  id: string;
  name: string;
  scopes: string[];
  avatarUrl?: string;
}

export class AtlassianOAuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private scopes: string[];

  constructor() {
    if (
      !process.env.ATLASSIAN_CLIENT_ID ||
      !process.env.ATLASSIAN_CLIENT_SECRET ||
      !process.env.ATLASSIAN_REDIRECT_URI
    ) {
      throw new Error('Missing required Atlassian environment variables');
    }

    this.clientId = process.env.ATLASSIAN_CLIENT_ID;
    this.clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
    this.redirectUri = process.env.ATLASSIAN_REDIRECT_URI;
    this.scopes = [
      'read:me', // Required for user info
      'read:jira-user',
      'read:jira-work',
      'read:confluence-user',
      'read:confluence-content.all',
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

    return response.json() as Promise<AtlassianTokenResponse>;
  }

  private async getUserInfo(accessToken: string): Promise<AtlassianUserInfo> {
    const response = await globalThis.fetch('https://api.atlassian.com/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get user info: ${error}`);
    }

    return response.json() as Promise<AtlassianUserInfo>;
  }

  private async getAccessibleResources(
    accessToken: string
  ): Promise<AtlassianAccessibleResource[]> {
    const response = await globalThis.fetch(
      'https://api.atlassian.com/oauth/token/accessible-resources',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get accessible resources: ${error}`);
    }

    return response.json() as Promise<AtlassianAccessibleResource[]>;
  }

  handleInstall = asyncHandler(async (req: Request, res: Response) => {
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
      const userInfo = await this.getUserInfo(tokenResponse.access_token);
      const resources = await this.getAccessibleResources(
        tokenResponse.access_token
      );

      // Set secure HttpOnly cookies for Atlassian tokens and user info
      const isProduction = process.env.NODE_ENV === 'production';

      // Cookie helper functions (reused from Slack/Azure implementation)
      const secureCookieString = (name: string, value: string) =>
        `${name}=${encodeURIComponent(value)}; HttpOnly; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=86400; Path=/`;

      const regularCookieString = (name: string, value: string) =>
        `${name}=${encodeURIComponent(value)}; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=86400; Path=/`;

      // Set Atlassian token as HttpOnly cookie
      const cookies = [
        secureCookieString('atlassian_token', tokenResponse.access_token),
      ];

      // Store refresh token if available
      if (tokenResponse.refresh_token) {
        cookies.push(
          secureCookieString('atlassian_refresh_token', tokenResponse.refresh_token)
        );
      }

      // Store user info in regular cookies
      if (userInfo.name) {
        cookies.push(
          regularCookieString('atlassian_user_name', userInfo.name)
        );
      }
      if (userInfo.email) {
        cookies.push(
          regularCookieString('atlassian_user_email', userInfo.email)
        );
      }

      res.setHeader('Set-Cookie', cookies);

      // Redirect to home page without tokens in URL
      const redirectUrl = new URL(`${process.env.HOME_PAGE_URL}/`);
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error('API_KEY environment variable is required');
      }

      redirectUrl.searchParams.set('apikey', apiKey);

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

    return response.json() as Promise<AtlassianTokenResponse>;
  }
}
