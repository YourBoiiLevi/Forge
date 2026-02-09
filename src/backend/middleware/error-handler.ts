import type { NextFunction, Request, Response } from 'express';

import { HttpError } from '../lib/http-error';

export interface ForgeErrorEnvelope {
  error: string;
  code: string;
  details?: unknown;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    const body: ForgeErrorEnvelope = {
      error: err.message,
      code: err.code,
      ...(err.details === undefined ? {} : { details: err.details }),
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.error('Unhandled error', err);
  }

  const body: ForgeErrorEnvelope = {
    error: 'Internal Error',
    code: 'INTERNAL_ERROR',
  };
  res.status(500).json(body);
}
