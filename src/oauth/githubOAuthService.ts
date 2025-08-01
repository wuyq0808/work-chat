import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { setGitHubCookies } from '../utils/cookie-utils.js';
import type { GitHubTokenResponse } from '../types/github.js';
import type { GitHubConfig } from '../utils/secrets-manager.js';

export class GitHubOAuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private scopes: string[];

  constructor(config: GitHubConfig) {
    if (
      !config.GITHUB_CLIENT_ID ||
      !config.GITHUB_CLIENT_SECRET ||
      !config.GITHUB_REDIRECT_URI
    ) {
      throw new Error('Missing required GitHub configuration');
    }

    this.clientId = config.GITHUB_CLIENT_ID;
    this.clientSecret = config.GITHUB_CLIENT_SECRET;
    this.redirectUri = config.GITHUB_REDIRECT_URI;
    this.scopes = [
      'repo', // Full access to public and private repositories (no read-only option available)
    ];
  }

  private generateAuthorizationUrl(): string {
    const baseUrl = 'https://github.com/login/oauth/authorize';
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(' '),
      state: Math.random().toString(36).substring(2, 15),
      response_type: 'code',
    });

    return `${baseUrl}?${params.toString()}`;
  }

  private async exchangeCodeForToken(
    code: string
  ): Promise<GitHubTokenResponse> {
    const tokenUrl = 'https://github.com/login/oauth/access_token';

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
    });

    const response = await globalThis.fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenResponse = (await response.json()) as GitHubTokenResponse;

    // Validate required fields
    if (!tokenResponse.access_token) {
      throw new Error(
        'GitHub token response missing required field: access_token'
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
            <title>GitHub OAuth Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #e01e5a; }
            </style>
          </head>
          <body>
            <h1 class="error">❌ GitHub OAuth Failed</h1>
            <p>Error: ${error}</p>
            <p>Description: ${error_description || 'Unknown error'}</p>
            <p>Please try again or contact support.</p>
            <a href="/github/install">Try Again</a>
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
      const cookies = setGitHubCookies(tokenResponse, isSecureCookie);

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
            <title>GitHub OAuth Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #e01e5a; }
            </style>
          </head>
          <body>
            <h1 class="error">❌ GitHub OAuth Failed</h1>
            <p>There was an error processing your GitHub OAuth request.</p>
            <p>Error: ${errorMessage}</p>
            <p>Please try again or contact support.</p>
            <a href="/github/install">Try Again</a>
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
}
