/**
 * Utility functions for creating secure cookie strings
 */

import type { AtlassianTokenResponse } from '../types/atlassian.js';
import type { GitHubTokenResponse } from '../types/github.js';
import type { Request, Response } from 'express';
import { AtlassianOAuthService } from '../oauth/atlassianOAuthService.js';
import {
  AzureOAuthService,
  type AzureUserInfo,
} from '../oauth/azureOAuthService.js';

// Import the Azure token response interface (we'll create a shared type)
interface AzureTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export function getCookieString(
  name: string,
  value: string,
  options: {
    expiresIn: number;
    isSecureCookie: boolean;
    httpOnly?: boolean;
  }
): string {
  const { expiresIn, isSecureCookie, httpOnly = false } = options;
  const httpOnlyString = httpOnly ? 'HttpOnly; ' : '';
  const secureString = isSecureCookie ? 'Secure; ' : '';

  return `${name}=${encodeURIComponent(value)}; ${httpOnlyString}${secureString}SameSite=Strict; Max-Age=${expiresIn}; Path=/`;
}

export function setAtlassianCookies(
  tokenData: AtlassianTokenResponse,
  isSecureCookie: boolean
): string[] {
  return [
    getCookieString('atlassian_token', tokenData.access_token, {
      expiresIn: tokenData.expires_in,
      isSecureCookie,
      httpOnly: true,
    }),
    getCookieString('atlassian_refresh_token', tokenData.refresh_token, {
      expiresIn: 2592000, // 30 days
      isSecureCookie,
      httpOnly: true,
    }),
    getCookieString('atlassian_connected', 'true', {
      expiresIn: tokenData.expires_in,
      isSecureCookie,
      httpOnly: false,
    }),
  ];
}

export function setAzureCookies(
  tokenData: AzureTokenResponse,
  userInfo: AzureUserInfo,
  isSecureCookie: boolean
): string[] {
  return [
    getCookieString('azure_token', tokenData.access_token, {
      expiresIn: tokenData.expires_in,
      isSecureCookie,
      httpOnly: true,
    }),
    getCookieString('azure_refresh_token', tokenData.refresh_token, {
      expiresIn: 2592000, // 30 days
      isSecureCookie,
      httpOnly: true,
    }),
    getCookieString('azure_user_name', userInfo.displayName || '', {
      expiresIn: tokenData.expires_in,
      isSecureCookie,
      httpOnly: false,
    }),
    getCookieString(
      'azure_user_email',
      userInfo.mail || userInfo.userPrincipalName || '',
      {
        expiresIn: tokenData.expires_in,
        isSecureCookie,
        httpOnly: false,
      }
    ),
  ];
}

export function setGitHubCookies(
  tokenData: GitHubTokenResponse,
  isSecureCookie: boolean
): string[] {
  return [
    getCookieString('github_token', tokenData.access_token, {
      expiresIn: 2592000, // 30 days (GitHub tokens don't expire by default)
      isSecureCookie,
      httpOnly: true,
    }),
    getCookieString('github_connected', 'true', {
      expiresIn: 2592000, // 30 days
      isSecureCookie,
      httpOnly: false,
    }),
  ];
}

// Helper function to refresh Atlassian token
export async function refreshAtlassianToken(
  req: Request,
  res: Response,
  atlassianOAuthService: AtlassianOAuthService,
  isSecureCookie: boolean
): Promise<void> {
  const accessToken = req.cookies.atlassian_token;
  const refreshToken = req.cookies.atlassian_refresh_token;

  // If we have a refresh token but no access token (expired), try to refresh
  if (refreshToken && !accessToken) {
    try {
      const tokenResponse =
        await atlassianOAuthService.refreshToken(refreshToken);

      // Set new cookies using utility function
      const cookies = setAtlassianCookies(tokenResponse, isSecureCookie);

      res.setHeader('Set-Cookie', cookies);
    } catch {
      // Clear invalid refresh token cookie
      res.clearCookie('atlassian_refresh_token');
      res.clearCookie('atlassian_token');
      res.clearCookie('atlassian_connected');
    }
  }
}

// Helper function to refresh Azure token
export async function refreshAzureToken(
  req: Request,
  res: Response,
  azureOAuthService: AzureOAuthService,
  isSecureCookie: boolean
): Promise<void> {
  const accessToken = req.cookies.azure_token;
  const refreshToken = req.cookies.azure_refresh_token;

  const hasUserInfo =
    req.cookies.azure_user_name && req.cookies.azure_user_name !== 'null';

  // Try to refresh if:
  // 1. We have refresh token but no access token (expired and removed)
  // 2. We have refresh token but no user info (indicates previous refresh cleared cookies)
  if (refreshToken && (!accessToken || !hasUserInfo)) {
    try {
      const tokenResponse = await azureOAuthService.refreshToken(refreshToken);

      // Fetch fresh user info with the new access token
      const userInfo = await azureOAuthService.getUserInfo(
        tokenResponse.access_token
      );

      const cookies = setAzureCookies(tokenResponse, userInfo, isSecureCookie);
      res.setHeader('Set-Cookie', cookies);
    } catch {
      // Clear invalid refresh token cookies
      res.clearCookie('azure_refresh_token');
      res.clearCookie('azure_token');
      res.clearCookie('azure_user_name');
      res.clearCookie('azure_user_email');
    }
  }
}
