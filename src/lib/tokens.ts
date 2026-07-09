// Signed one-click unsubscribe tokens: base64url(email) + '.' + HMAC-SHA256(email).
// Must work logged-out and be tamper-proof; the secret never leaves the server.
import { createHmac, timingSafeEqual } from 'node:crypto';

function secret(): string {
  const value = process.env['REHABSYNC_SALES_UNSUBSCRIBE_SECRET'];
  if (!value) throw new Error('REHABSYNC_SALES_UNSUBSCRIBE_SECRET is not set');
  return value;
}

function sign(email: string): string {
  return createHmac('sha256', secret()).update(email.toLowerCase()).digest('base64url');
}

export function unsubscribeToken(email: string): string {
  return `${Buffer.from(email.toLowerCase()).toString('base64url')}.${sign(email)}`;
}

/** Returns the email when the token verifies, null otherwise. */
export function verifyUnsubscribeToken(token: string): string | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  let email: string;
  try {
    email = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!email.includes('@')) return null;
  const expected = Buffer.from(sign(email));
  const candidate = Buffer.from(signature);
  return expected.length === candidate.length && timingSafeEqual(expected, candidate) ? email : null;
}
