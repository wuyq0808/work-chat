/**
 * Utility functions for creating secure cookie strings
 */

import type { AtlassianTokenResponse } from '../types/atlassian.js';
import type { Request, Response } from 'express';
import { AtlassianOAuthService } from '../services/atlassianOAuthService.js';
import {
  AzureOAuthService,
  type AzureUserInfo,
} from '../services/azureOAuthService.js';

// Import the Azure token response interface (we'll create a shared type)
interface AzureTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export function accessTokenCookieString(
  name: string,
  value: string,
  expiresIn: number,
  isSecureCookie: boolean
): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; ${isSecureCookie ? 'Secure; ' : ''}SameSite=Strict; Max-Age=${expiresIn}; Path=/`;
}

export function refreshTokenCookieString(
  name: string,
  value: string,
  isSecureCookie: boolean
): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; ${isSecureCookie ? 'Secure; ' : ''}SameSite=Strict; Max-Age=2592000; Path=/`;
}

export function regularCookieString(
  name: string,
  value: string,
  expiresIn: number,
  isSecureCookie: boolean
): string {
  return `${name}=${encodeURIComponent(value)}; ${isSecureCookie ? 'Secure; ' : ''}SameSite=Strict; Max-Age=${expiresIn}; Path=/`;
}

export function setAtlassianCookies(
  tokenData: AtlassianTokenResponse,
  isSecureCookie: boolean
): string[] {
  return [
    accessTokenCookieString(
      'atlassian_token',
      tokenData.access_token,
      tokenData.expires_in,
      isSecureCookie
    ),
    refreshTokenCookieString(
      'atlassian_refresh_token',
      tokenData.refresh_token,
      isSecureCookie
    ),
    regularCookieString(
      'atlassian_connected',
      'true',
      tokenData.expires_in,
      isSecureCookie
    ),
  ];
}

export function setAzureCookies(
  tokenData: AzureTokenResponse,
  userInfo: AzureUserInfo,
  isSecureCookie: boolean
): string[] {
  return [
    accessTokenCookieString(
      'azure_token',
      tokenData.access_token,
      tokenData.expires_in,
      isSecureCookie
    ),
    refreshTokenCookieString(
      'azure_refresh_token',
      tokenData.refresh_token,
      isSecureCookie
    ),
    regularCookieString(
      'azure_user_name',
      userInfo.displayName || '',
      tokenData.expires_in,
      isSecureCookie
    ),
    regularCookieString(
      'azure_user_email',
      userInfo.mail || userInfo.userPrincipalName || '',
      tokenData.expires_in,
      isSecureCookie
    ),
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
