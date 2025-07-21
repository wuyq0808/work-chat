/**
 * Utility functions for creating secure cookie strings
 */

import type { AtlassianTokenResponse } from '../types/atlassian.js';

export function accessTokenCookieString(
  name: string,
  value: string,
  expiresIn: number,
  isProduction: boolean
): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=${expiresIn}; Path=/`;
}

export function refreshTokenCookieString(
  name: string,
  value: string,
  isProduction: boolean
): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=2592000; Path=/`;
}

export function regularCookieString(
  name: string,
  value: string,
  expiresIn: number,
  isProduction: boolean
): string {
  return `${name}=${encodeURIComponent(value)}; ${isProduction ? 'Secure; ' : ''}SameSite=Strict; Max-Age=${expiresIn}; Path=/`;
}

export function setAtlassianCookies(
  tokenData: AtlassianTokenResponse,
  isProduction: boolean
): string[] {
  const cookies: string[] = [];

  // Set access token cookie
  cookies.push(
    accessTokenCookieString(
      'atlassian_token',
      tokenData.access_token,
      tokenData.expires_in,
      isProduction
    )
  );

  // Set refresh token cookie if available
  if (tokenData.refresh_token) {
    cookies.push(
      refreshTokenCookieString(
        'atlassian_refresh_token',
        tokenData.refresh_token,
        isProduction
      )
    );
  }

  // Set connection indicator cookie (non-HttpOnly so frontend can read it)
  cookies.push(
    regularCookieString(
      'atlassian_connected',
      'true',
      tokenData.expires_in,
      isProduction
    )
  );

  return cookies;
}
