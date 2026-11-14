import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type UserRole = 'admin' | 'operator' | 'finance';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
}

const SESSION_COOKIE_NAME = 'precisionhub_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || 'precisionhub-dev-secret-key-2026';
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

export function createSessionToken(): { rawId: string; signedToken: string; expiresAt: string } {
  const rawId = randomBytes(32).toString('hex');
  const sig = createHmac('sha256', getSessionSecret()).update(rawId).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  return {
    rawId,
    signedToken: `${rawId}.${sig}`,
    expiresAt,
  };
}

export function verifySessionToken(signedToken: string): string | null {
  const parts = signedToken.split('.');
  if (parts.length !== 2) return null;
  const [rawId, sig] = parts;
  if (!rawId || !sig) return null;
  const expectedSig = createHmac('sha256', getSessionSecret()).update(rawId).digest('hex');
  try {
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
    return rawId;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) continue;
    const key = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  }
  return cookies;
}

export function setSessionCookie(res: Response, signedToken: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(signedToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isProd) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export function getSessionIdFromRequest(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  return verifySessionToken(token);
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Sesión no autenticada' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Permisos insuficientes para esta operación' });
      return;
    }
    next();
  };
}
