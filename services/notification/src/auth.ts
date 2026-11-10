import { createHmac, timingSafeEqual } from 'node:crypto';

export interface Claims {
  org: string;
  exp: number;
  [key: string]: unknown;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

/**
 * Verifies a token (JWT, HS256) signed by the billing service and returns its claims, or null when it is not valid:
 * wrong format, other algorithm, wrong signature, expired, or without a company. No user database, no session.
 * HS256 is simple enough to check by hand: the signature is HMAC-SHA256 of "header.payload" with the shared secret.
 */
export function verifyToken(token: string, secret: string, now = Date.now()): Claims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  try {
    if (JSON.parse(Buffer.from(header, 'base64url').toString('utf8')).alg !== 'HS256') return null;

    const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Claims;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
    if (typeof claims.org !== 'string' || !claims.org) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Test helper: builds a token like the billing service does. */
export function signToken(claims: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}
