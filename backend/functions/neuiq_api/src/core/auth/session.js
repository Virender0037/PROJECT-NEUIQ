/**
 * Session tokens: mint and verify.
 *
 * Extracted from middleware/index.js. Pure crypto over a payload — it reads no records and knows
 * about no product, which is why it separates cleanly from principal.js.
 *
 * ## On the auth in here
 *
 * This is a DEMO identity layer and it is labelled as one everywhere it appears. It signs a token
 * with an HMAC and a shared secret, which is real enough that a client cannot forge a role by
 * editing a header — but there is no password check, no session revocation and no expiry beyond
 * the one in the payload.
 *
 * What it does do, and the reason it exists at all, is establish **who the caller is and which
 * employee record they map to**, because every guarantee elsewhere in this backend rests on that:
 * the query engine's scoping, the tools' subject checks, dashboard ownership. Building those
 * against a stub is fine; shipping this is not.
 *
 * The real design is docs/backend/16-identity-authorization.md, unwritten.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = () => process.env.AUTH_SECRET || 'neuiq-demo-secret-not-for-production';

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (body) => createHmac('sha256', SECRET()).update(body).digest('base64url');

/** Mint a token for an employee record. */
export function issueToken(employee) {
  const payload = {
    sub: employee.employeeId,
    employeeId: employee.employeeId,
    username: employee.username,
    name: `${employee.firstName} ${employee.lastName}`,
    role: employee.role,
    exp: Date.now() + 12 * 60 * 60 * 1000,
  };
  const body = b64(payload);
  return `${body}.${sign(body)}`;
}

/**
 * Verify a token. Returns the payload or null — never throws, so a malformed header is a 401
 * rather than a 500.
 */
export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  try {
    const expected = sign(body);
    // Compared with timingSafeEqual, not ===. Cheap to do correctly, and a string compare on a
    // MAC is the textbook timing leak.
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
