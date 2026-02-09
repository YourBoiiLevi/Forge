import type { NextFunction, Request, Response } from 'express';

const LOCALHOST_ORIGIN_RE = /^https?:\/\/localhost(?::\d+)?$/;

export function corsForLocalhost(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const originStr = typeof origin === 'string' ? origin : undefined;

  if (originStr && LOCALHOST_ORIGIN_RE.test(originStr)) {
    res.setHeader('Access-Control-Allow-Origin', originStr);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}
