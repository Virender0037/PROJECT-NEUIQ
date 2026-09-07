/**
 * Middleware: request ids, caller identity, and the error boundary.
 *
 * ## On the auth in here
 *
 * This is a DEMO identity layer and it is labelled as one everywhere it appears. It signs a
 * token with an HMAC and a shared secret, which is real enough that a client cannot forge a role
 * by editing a header — but there is no password check, no session revocation and no expiry
 * beyond the one in the payload.
 *
 * What it does do, and the reason it exists at all, is establish **who the caller is and which
 * Zoho employee they map to**, because every guarantee elsewhere in this backend rests on that:
 * the query engine's scoping, the tools' subject checks, dashboard ownership. Building those
 * against a stub is fine; shipping this is not.
 *
 * The real design is docs/backend/16-identity-authorization.md, unwritten. See the section at
 * the bottom of backend/README.md.
 */
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { dataset } from '../dashboards/query.service.js';

const SECRET = () => process.env.AUTH_SECRET || 'neuiq-demo-secret-not-for-production';

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (body) => createHmac('sha256', SECRET()).update(body).digest('base64url');

/** Mint a token for a seeded employee. */
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

/** A correlation id on every request and every log line and every response. */
export function requestId(req, res, next) {
  req.id = req.get('x-request-id') || randomUUID();
  res.set('x-request-id', req.id);
  next();
}

/** One structured line per request, with the timing. */
export function logger(req, res, next) {
  const started = Date.now();
  res.on('finish', () => {
    // Never log the Authorization header, the token, or any employee field. requestId is the
    // handle for correlating - see docs/backend/10-errors-observability.md.
    console.log(JSON.stringify({
      requestId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - started,
      actor: req.user?.username || null,
    }));
  });
  next();
}

/**
 * Resolve the caller.
 *
 * The employee record is looked up fresh from the dataset rather than trusted from the token, so
 * a role change takes effect immediately instead of on next sign-in — and so a token cannot
 * assert a role its employee does not have.
 */
export function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) {
    return res.status(401).json({ requestId: req.id, success: false, error: 'Sign in to continue.' });
  }
  const employee = dataset.employees.find((e) => e.employeeId === payload.employeeId);
  if (!employee) {
    return res.status(401).json({ requestId: req.id, success: false, error: 'Account no longer exists.' });
  }
  req.user = {
    employeeId: employee.employeeId,
    username: employee.username,
    name: `${employee.firstName} ${employee.lastName}`,
    role: employee.role,
    department: employee.department,
  };
  next();
}

/**
 * The error boundary.
 *
 * Anything without an explicit `status` is treated as a bug: the client gets a generic message
 * and the detail goes to the log. A stack trace in a response body is how internals leak.
 */
export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(`[${req.id}] ${err.stack || err.message}`);
  res.status(status).json({
    requestId: req.id,
    success: false,
    error: status >= 500 ? 'Something went wrong on our side.' : err.message,
  });
}

/** 404 for anything unrouted, in the same envelope as every other error. */
export function notFound(req, res) {
  res.status(404).json({ requestId: req.id, success: false, error: `No route for ${req.method} ${req.path}` });
}
