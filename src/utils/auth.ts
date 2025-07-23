import type { Request } from 'express';

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function getSlackTokenFromCookie(req: Request): string {
  // Get from HttpOnly cookie using cookie-parser
  const cookies =
    (req as Request & { cookies?: Record<string, string> }).cookies || {};

  return cookies.slack_token || '';
}

export function getAzureTokenFromCookie(req: Request): string {
  // Get from HttpOnly cookie using cookie-parser
  const cookies =
    (req as Request & { cookies?: Record<string, string> }).cookies || {};

  return cookies.azure_token || '';
}

export function getAtlassianTokenFromCookie(req: Request): string {
  // Get from HttpOnly cookie using cookie-parser
  const cookies =
    (req as Request & { cookies?: Record<string, string> }).cookies || {};

  return cookies.atlassian_token || '';
}

export function getAzureUserNameFromCookie(req: Request): string | undefined {
  const cookies =
    (req as Request & { cookies?: Record<string, string> }).cookies || {};
  
  return cookies.azure_user_name || undefined;
}

export function getSlackUserIdFromCookie(req: Request): string | undefined {
  const cookies =
    (req as Request & { cookies?: Record<string, string> }).cookies || {};
  
  return cookies.slack_user_id || undefined;
}
