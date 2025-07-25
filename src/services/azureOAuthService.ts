import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { setAzureCookies } from '../utils/cookie-utils.js';
import type { AzureConfig } from '../utils/secrets-manager.js';

interface AzureTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface AzureUserInfo {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail?: string;
}

export class AzureOAuthService {
  private clientId: string;
  private clientSecret: string;
  private tenantId: string;
  private redirectUri: string;
  private scopes: string[];

  constructor(config: AzureConfig) {
    if (
      !config.AZURE_CLIENT_ID ||
      !config.AZURE_CLIENT_SECRET ||
      !config.AZURE_TENANT_ID ||
      !config.AZURE_REDIRECT_URI
    ) {
      throw new Error('Missing required Azure configuration');
    }

    this.clientId = config.AZURE_CLIENT_ID;
    this.clientSecret = config.AZURE_CLIENT_SECRET;
    this.tenantId = config.AZURE_TENANT_ID;
    this.redirectUri = config.AZURE_REDIRECT_URI;
    this.scopes = ['https://graph.microsoft.com/.default', 'offline_access'];
  }

  private generateAuthorizationUrl(): string {
    const baseUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize`;
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(' '),
      state: Math.random().toString(36).substring(2, 15),
      response_mode: 'query',
    });

    return `${baseUrl}?${params.toString()}`;
  }

  private async exchangeCodeForToken(
    code: string
  ): Promise<AzureTokenResponse> {
    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(' '),
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

    const tokenResponse = (await response.json()) as AzureTokenResponse;

    // Validate required fields
    if (!tokenResponse.access_token || !tokenResponse.refresh_token) {
      throw new Error(
        'Azure token response missing required fields: access_token or refresh_token'
      );
    }

    return tokenResponse;
  }

  private async getUserInfo(accessToken: string): Promise<AzureUserInfo> {
    const response = await globalThis.fetch(
      'https://graph.microsoft.com/v1.0/me',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get user info: ${error}`);
    }

    return response.json() as Promise<AzureUserInfo>;
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
            <title>Azure OAuth Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #e01e5a; }
            </style>
          </head>
          <body>
            <h1 class="error">❌ Azure OAuth Failed</h1>
            <p>Error: ${error}</p>
            <p>Description: ${error_description || 'Unknown error'}</p>
            <p>Please try again or contact support.</p>
            <a href="/azure/install">Try Again</a>
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

      // Set secure HttpOnly cookies for Azure tokens and user info
      const isSecureCookie = process.env.NODE_ENV === 'production';

      // Set all cookies using utility function
      const cookies = setAzureCookies(tokenResponse, userInfo, isSecureCookie);

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
            <title>Azure OAuth Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #e01e5a; }
            </style>
          </head>
          <body>
            <h1 class="error">❌ Azure OAuth Failed</h1>
            <p>There was an error processing your Azure OAuth request.</p>
            <p>Error: ${errorMessage}</p>
            <p>Please try again or contact support.</p>
            <a href="/azure/install">Try Again</a>
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

  async refreshToken(refreshToken: string): Promise<AzureTokenResponse> {
    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: this.scopes.join(' '),
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
      throw new Error(`Azure token refresh failed: ${error}`);
    }

    const tokenResponse = (await response.json()) as AzureTokenResponse;

    // Validate required fields
    if (!tokenResponse.access_token || !tokenResponse.refresh_token) {
      throw new Error(
        'Azure refresh token response missing required fields: access_token or refresh_token'
      );
    }

    return tokenResponse;
  }
}
