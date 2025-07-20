import type { Request, Response, NextFunction } from 'express';
import { AuthError } from '../utils/auth.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  console.log(
    `Error: ${req.method} ${req.url} - ${err.message} - Headers: ${JSON.stringify(req.headers, null, 0)} - Body: ${JSON.stringify(req.body, null, 0)}`
  );

  if (err instanceof AuthError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
  });
}

export function asyncHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any> // Express handler return types vary
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
