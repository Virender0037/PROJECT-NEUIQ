/**
 * Express middleware: request ids, the authenticate gate, and the error boundary.
 *
 * What used to be one middleware/index.js is now three files. The token crypto moved to
 * core/auth/session.js and the identity lookup to core/auth/principal.js; what is left here is
 * the Express-shaped wiring that turns those into request handling. None of it reads a record or
 * imports a product.
 */
import { randomUUID } from 'node:crypto';
import { verifyToken } from '../auth/session.js';
import { resolvePrincipal } from '../auth/principal.js';

export { issueToken, verifyToken } from '../auth/session.js';

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
 * The employee record is looked up fresh through the registered identity resolver rather than
 * trusted from the token, so a role change takes effect immediately instead of on next sign-in —
 * and so a token cannot assert a role its employee does not have.
 */
export function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) {
    return res.status(401).json({ requestId: req.id, success: false, error: 'Sign in to continue.' });
  }
  const user = resolvePrincipal(payload);
  if (!user) {
    return res.status(401).json({ requestId: req.id, success: false, error: 'Account no longer exists.' });
  }
  req.user = user;
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
