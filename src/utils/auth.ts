import type { Request } from 'express';

export class AuthError extends Error {
  constructor(message: string, public statusCode: number) {
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
  // Try header first
  let slackToken = req.headers['x-slack-user-token'] as string;
  
  // If not in header, try URL parameter
  if (!slackToken) {
    slackToken = req.query.slack_token as string;
  }
  
  if (!slackToken) {
    throw new AuthError('Slack user token required in X-Slack-User-Token header or slack_token URL parameter', 400);
  }
  
  return slackToken;
}