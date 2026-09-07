/**
 * The one place the frontend talks to the backend.
 *
 * Every call in the app goes through `request()`. That is not tidiness for its own sake — three
 * things have to be true on every single request, and one shared function is the only way to be
 * sure they are:
 *
 *  1. **The bearer token is attached.** Forget it on one call and you get a 401 that looks like a
 *     bug in that screen rather than a missing header.
 *  2. **The envelope is unwrapped once.** The server answers `{ requestId, success, ...body }`.
 *     Screens should see `body`, and should never be the code that decides what `success: false`
 *     means.
 *  3. **A failure carries its status and its requestId.** `status` is what tells a 403 (you are
 *     not allowed) apart from a 404 (it is gone) apart from a network error (the server is down),
 *     and those three want three different things on screen. `requestId` is the handle that
 *     matches the response to a line in the server log.
 *
 * ## Why every caller has an offline fallback
 *
 * This is a demo that gets shown to a client, often on a laptop with only the frontend running.
 * A dead backend must degrade to local sample data, never to a blank screen. But it must degrade
 * VISIBLY: `isOffline()` is what lets a screen say "sample data — API offline" instead of quietly
 * presenting made-up figures as though they came from Zoho. Presenting one as the other is how
 * people stop trusting both.
 */

/** Base URL. Override with VITE_API_URL in frontend/.env.local to point at a deployed backend. */
export const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:4200/api/v1';

/** The key the token is remembered under, so a refresh does not sign you out. */
const TOKEN_KEY = 'neuiq_token';

export class ApiError extends Error {
  constructor(message, { status = 0, requestId = null, offline = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
    /** True when the request never reached the server — distinct from any HTTP status. */
    this.offline = offline;
  }
}

// ---- token ----------------------------------------------------------------

let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { /* private mode */ }

export const getToken = () => token;

/** Store (or clear) the token. Passing null signs out. */
export function setToken(next) {
  token = next || null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode: the session still works, it just will not survive a refresh */ }
}

// ---- reachability ---------------------------------------------------------

/**
 * Whether the last request reached the server.
 *
 * Deliberately a single module-level flag rather than per-call state: the answer is a property of
 * the backend, not of one screen, and every screen wants to show the same banner about it.
 */
let offline = false;
const listeners = new Set();

export const isOffline = () => offline;

/** Subscribe to reachability changes. Returns an unsubscribe function. */
export function onOfflineChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setOffline(next) {
  if (offline === next) return;
  offline = next;
  listeners.forEach((fn) => fn(next));
}

// ---- the request ----------------------------------------------------------

/**
 * One HTTP call.
 *
 * `signal` is accepted and passed straight through so a screen that unmounts mid-flight can abort
 * rather than setting state on a dead component. `timeout` exists because a server that accepts
 * the connection and then never answers would otherwise hang the spinner forever — a wrong answer
 * is bad, but a spinner that never resolves is the one users read as "broken".
 */
export async function request(path, { method = 'GET', body, signal, timeout = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  // Honour a caller's own abort as well as the timeout.
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : null),
        ...(token ? { authorization: `Bearer ${token}` } : null),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // A caller-driven abort is not a backend outage, so it must not flip the offline flag or
    // every navigation away from a loading screen would show the banner.
    if (signal?.aborted) throw new ApiError('Request cancelled', { status: 0 });
    setOffline(true);
    throw new ApiError('Cannot reach the NeuIQ API.', { status: 0, offline: true });
  }
  clearTimeout(timer);
  setOffline(false);

  const requestId = res.headers.get('x-request-id');
  // A 204, or an error page from something that is not our API, has no JSON body.
  const payload = await res.json().catch(() => null);

  if (!res.ok || payload?.success === false) {
    const message = payload?.error || `Request failed (${res.status})`;
    // A stale or tampered token: drop it so the app returns to the sign-in screen instead of
    // retrying with credentials that will never work again.
    if (res.status === 401) setToken(null);
    throw new ApiError(message, { status: res.status, requestId });
  }

  // Strip the envelope. Screens get the body and nothing else.
  const { success, requestId: _rid, ...rest } = payload || {};
  return rest;
}

// ---- typed helpers -------------------------------------------------------
// Thin on purpose: one function per endpoint, named after what it answers rather than after its
// path, so a screen reads as intent and a route change touches one line.

export const api = {
  health: () => request('/health'),

  /** The seeded demo accounts, so the sign-in screen can offer roles instead of asking you to
   *  memorise usernames. See the note at the top of backend/middleware/index.js. */
  demoUsers: () => request('/auth/users'),
  login: (username) => request('/auth/login', { method: 'POST', body: { username } }),
  me: () => request('/me'),

  /** Ask a question. Returns { answer, tool, data, outcome, source, pinnable }.
   *  Takes `opts` so the composer's stop button can abort a question in flight. */
  chat: (message, history = [], opts) =>
    request('/chat', { method: 'POST', body: { message, history }, ...opts }),

  /** What the assistant can reach, for the AI tab. */
  capabilities: () => request('/ai/capabilities'),

  /** Resolve one widget query. This is the call that re-checks authorization on every read. */
  query: (spec, opts) => request('/query', { method: 'POST', body: spec, ...opts }),

  analyticsSummary: (opts) => request('/analytics/summary', opts),

  dashboards: {
    list: () => request('/dashboards'),
    create: (title, widgets) => request('/dashboards', { method: 'POST', body: { title, widgets } }),
    update: (id, patch) => request(`/dashboards/${id}`, { method: 'PATCH', body: patch }),
    duplicate: (id) => request(`/dashboards/${id}/duplicate`, { method: 'POST' }),
    remove: (id) => request(`/dashboards/${id}`, { method: 'DELETE' }),
    /** Build a spec from a description. Nothing is saved — the client previews first. */
    build: (prompt) => request('/dashboards/build', { method: 'POST', body: { prompt } }),
    meta: () => request('/dashboards/meta'),
  },
};
