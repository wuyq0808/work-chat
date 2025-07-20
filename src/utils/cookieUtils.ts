/**
 * Utility functions for creating secure cookie strings
 */

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
