import type { NextFunction, Request, Response } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }

  const startMs = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startMs;

    // Keep this intentionally lightweight for MVP.
    // eslint-disable-next-line no-console
    console.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`);
  });

  next();
}
