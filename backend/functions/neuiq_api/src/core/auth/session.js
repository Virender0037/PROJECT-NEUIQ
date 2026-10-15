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

/**
 * The demo fallback. Public — it is in this file — so it may only ever sign DEMO tokens over seed
 * data. Anything that could protect non-demo authentication must have a real AUTH_SECRET; the
 * startup profile (core/platform/environment.js) refuses to boot otherwise (S7).
 */
export const DEMO_SIGNING_SECRET = 'neuiq-demo-secret-not-for-production';

const SECRET = () => process.env.AUTH_SECRET || DEMO_SIGNING_SECRET;

/** Minimum AUTH_SECRET length where one is required. 32+ random bytes, base64url, is ~43 chars. */
export const MIN_SIGNING_SECRET_LENGTH = 32;
/** Fewer distinct characters than this is a repeated or patterned string, not a random one. */
const MIN_DISTINCT_CHARACTERS = 12;
/** Fragments that mark a value someone copied from an example instead of generating. */
const PLACEHOLDER = /(change[-_ ]?me|replace|placeholder|example|your[-_ ]?secret|secret[-_ ]?here|not[-_ ]?for[-_ ]?production|dummy|default|password|todo|xxxx|^<.*>$)/i;

/**
 * Why a signing secret is unacceptable, as a code — or null when it is acceptable.
 *
 *   missing       unset or blank
 *   demo-default  the public demo fallback above
 *   too-short     under MIN_SIGNING_SECRET_LENGTH characters
 *   placeholder   copied from an example ("changeme", "<your-secret>", "…example…")
 *   predictable   too few distinct characters to be random ("aaaa…", "abcabc…")
 *
 * Returns a CODE, never the value or its length: the caller's message must not help anyone guess it.
 */
export function signingSecretProblem(value) {
  const s = value === undefined || value === null ? '' : String(value);
  if (!s.trim()) return 'missing';
  if (s === DEMO_SIGNING_SECRET) return 'demo-default';
  if (s.length < MIN_SIGNING_SECRET_LENGTH) return 'too-short';
  if (PLACEHOLDER.test(s)) return 'placeholder';
  if (new Set(s).size < MIN_DISTINCT_CHARACTERS) return 'predictable';
  return null;
}

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
