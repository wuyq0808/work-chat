import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  accessTokenCookieString,
  regularCookieString,
} from '../utils/cookie-utils.js';

interface AzureTokenResponse {
  access_token: string;
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

  constructor() {
    if (
      !process.env.AZURE_CLIENT_ID ||
      !process.env.AZURE_CLIENT_SECRET ||
      !process.env.AZURE_TENANT_ID ||
      !process.env.AZURE_REDIRECT_URI
    ) {
      throw new Error('Missing required Azure environment variables');
    }

    this.clientId = process.env.AZURE_CLIENT_ID;
    this.clientSecret = process.env.AZURE_CLIENT_SECRET;
    this.tenantId = process.env.AZURE_TENANT_ID;
    this.redirectUri = process.env.AZURE_REDIRECT_URI;
    this.scopes = ['https://graph.microsoft.com/.default'];
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

    return response.json() as Promise<AzureTokenResponse>;
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
      const isProduction = process.env.NODE_ENV === 'production';

      // Set Azure token as HttpOnly cookie
      const cookies = [
        accessTokenCookieString(
          'azure_token',
          tokenResponse.access_token,
          tokenResponse.expires_in,
          isProduction
        ),
      ];

      // Store user info in regular cookies
      if (userInfo.displayName) {
        cookies.push(
          regularCookieString(
            'azure_user_name',
            userInfo.displayName,
            tokenResponse.expires_in,
            isProduction
          )
        );
      }
      if (userInfo.mail || userInfo.userPrincipalName) {
        cookies.push(
          regularCookieString(
            'azure_user_email',
            userInfo.mail || userInfo.userPrincipalName,
            tokenResponse.expires_in,
            isProduction
          )
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
}
