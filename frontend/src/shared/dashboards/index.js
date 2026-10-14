/**
 * On-demand dashboards — the client's half.
 *
 * Lives in shared/ because both UI styles use it. It started under ui/hybrid/ when Hybrid was
 * the only style with a dashboard; Classic having a real one too removed the reason.
 *
 * The contract (sources, whitelist, widget types) lives in ./spec.js and is re-exported here, so
 * every screen keeps importing one module. It is separate for one reason: spec.js has no imports
 * at all, which is what lets the whitelist be tested under plain `node`.
 *
 * Everything defined below calls the API and reports failure AS failure. Both used to fall back
 * to sample rows / a sample-built spec when the server was unreachable; that was removed in
 * Phase 4 — a chart with invented numbers, however labelled, is still invented HR data. The
 * sample helpers remain in spec.js only for the contract tests, and nothing at runtime calls them.
 */
import { api } from '@shared/api';
import { sanitize, cleanWidgets } from './spec.js';

export * from './spec.js';

/**
 * Resolve one widget.
 *
 * The spec is sanitized here before it is sent, so a widget the client already knows is invalid
 * costs no request — but the send is still the authority: it is where the row-level scoping is
 * applied and where a source the caller may not read becomes a 403.
 */
export async function resolveQuery(spec, opts) {
  const clean = sanitize(spec);
  if (!clean) return { data: [], meta: null, source: 'invalid' };
  // Unreachable, 403 and every other failure propagate: the widget shows "unavailable" or "not
  // permitted", never zero and never sample rows.
  const res = await api.query(clean, opts);
  return { ...res, source: 'api' };
}

/**
 * Build a spec from a description. Nothing is saved — the caller previews first.
 *
 * `source` comes back as the model name, `fallback` (the server's keyword builder) or `sample`
 * (this file's), and the screen shows it. Passing the keyword builder off as the model's work is
 * how people stop trusting both.
 */
export async function buildDashboard(prompt) {
  // No offline builder: the server's builder is scope-aware (it will not hand an employee an
  // admin-only widget), the client's sample one was not. A failure is a failure.
  const res = await api.dashboards.build(prompt);
  // The server whitelisted this already. Doing it again is not distrust of the server, it is
  // that `widgets` arrives as JSON and this is the last point before it is rendered.
  return { ...res, widgets: cleanWidgets(res.widgets) };
}
