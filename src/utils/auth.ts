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

export function verifyBearerToken(req: Request): string {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.API_KEY;

  if (!expectedToken) {
    console.warn('Warning: API_KEY environment variable not set');
    throw new AuthError('Server configuration error', 500);
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Unauthorized - Bearer token required', 401);
  }

  const token = authHeader.split(' ')[1];
  if (expectedToken && token !== expectedToken) {
    throw new AuthError('Unauthorized - Invalid token', 401);
  }

  return token;
}

export function getSlackToken(req: Request): string {
  // Get from HttpOnly cookie using cookie-parser
  const cookies = (req as any).cookies || {};
  
  if (!cookies.slack_token) {
    throw new AuthError('Slack token required in cookie', 401);
  }

  return cookies.slack_token;
}
