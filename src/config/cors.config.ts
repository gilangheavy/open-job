import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * Parses the raw `CORS_ORIGIN` env value into either:
 *  - the literal `'*'` (allow any origin), or
 *  - an explicit array of allowed origins.
 *
 * Empty / undefined input is treated as `'*'` for local-dev convenience.
 * Production deployments are expected to set an explicit whitelist.
 */
export function parseCorsOrigins(value: string | undefined): string[] | '*' {
  if (!value || value.trim() === '*') return '*';
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Applies CORS policy to the Nest application:
 *   1. Rejects requests whose `Origin` header is not in the whitelist with
 *      HTTP 403 + the standard `FailResponse` envelope
 *      (per Issue #19 acceptance criteria).
 *   2. Enables CORS for whitelisted origins via `enableCors`.
 *
 * Same-origin requests (no `Origin` header) and wildcard mode are passed
 * through untouched.
 */
export function applyCorsConfig(
  app: INestApplication,
  originValue?: string,
): void {
  const origins = parseCorsOrigins(originValue);

  if (origins !== '*') {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;
      if (origin && !origins.includes(origin)) {
        res.status(403).json({
          status: 'fail',
          message: 'CORS: origin not allowed',
        });
        return;
      }
      next();
    });
  }

  app.enableCors({
    origin: origins === '*' ? true : origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
}
