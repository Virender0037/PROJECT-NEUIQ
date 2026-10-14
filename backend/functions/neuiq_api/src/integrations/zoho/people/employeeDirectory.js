/**
 * The live employee directory — who each Zoho account IS, as Zoho People says, fail-closed.
 *
 * Phase 5.3 (E2). This is what a verified Zoho sign-in will be mapped onto (E5): a ZUID in, exactly
 * one active employee out — or a refusal with a reason. It is built and tested here but NOT yet
 * connected to sign-in or to authorization; the Phase 5.2 gate (no token accepted in zoho mode)
 * is untouched.
 *
 * ## Indexes, and what makes an entry refusable
 *
 *   byRecordId   __recordId -> entry       (records with a duplicated __recordId are excluded)
 *   byZuid       ZUID       -> entry       (a ZUID shared by two records maps to NOBODY)
 *   reports      manager __recordId -> [active direct reports' __recordIds]
 *
 * A record is excluded entirely when it has no usable __recordId, when its Zoho_ID disagrees with
 * its __recordId, or when its __recordId appears twice. A manager link is dropped when it is not an
 * id, points at the employee themselves, or points at a record that is not in the directory — a
 * relationship that cannot be checked must not grant reach. Nothing here reads names, departments,
 * titles or Zoho's Role to decide anything.
 *
 * ## The cache, and the rule it exists to keep
 *
 * One snapshot, at most five minutes old. **Expired data is discarded before a refresh, never
 * served while it runs and never served after it fails** — an identity or a reporting line that
 * may have changed must not grant access. Concretely:
 *
 *   fresh snapshot      served
 *   expired / none      refreshed; concurrent callers share ONE in-flight refresh
 *   refresh fails       every caller gets UNAVAILABLE; for a short cool-down further calls are
 *                       refused WITHOUT a request, so an outage is not hammered
 *   invalidate()        drops the snapshot now; an in-flight refresh started before it is not kept
 *
 * ## What is logged
 *
 * Event names, record counts, problem-code counts, error codes. Never an id, a ZUID, a name, an
 * email or a response body.
 */
import { transformEmployeeIdentity, exactId } from './transformers/employeeIdentity.js';

/** The longest a snapshot may be used. A configured TTL above this is clamped down. */
export const DIRECTORY_MAX_TTL_MS = 5 * 60 * 1000;
/** After a failed refresh, refuse without a request for this long. */
export const DIRECTORY_FAILURE_COOLDOWN_MS = 30 * 1000;
/** A response larger than this is treated as malformed rather than indexed. */
export const MAX_DIRECTORY_RECORDS = 10_000;

/** Why a lookup did not produce an employee. Codes, safe to log and to return. */
export const LOOKUP = Object.freeze({
  INVALID_ID: 'INVALID_ID',         // the id asked for is not an exact digit string
  NOT_LINKED: 'NOT_LINKED',         // no employee carries this ZUID
  DUPLICATE_ZUID: 'DUPLICATE_ZUID', // more than one employee carries it — refused, never picked
  NOT_FOUND: 'NOT_FOUND',           // no employee has this __recordId
  INACTIVE: 'INACTIVE',             // found, but Employeestatus is not exactly "Active"
  UNAVAILABLE: 'UNAVAILABLE',       // the directory could not be loaded right now
});

const PROBLEM_CODES = [
  'missing_record_id', 'record_id_mismatch', 'duplicate_record_id', 'missing_zuid', 'duplicate_zuid',
  'invalid_manager', 'self_manager', 'unknown_manager',
];

class DirectoryError extends Error {
  constructor(code) {
    super(`employee directory: ${code}`);
    this.name = 'DirectoryError';
    this.code = code;
  }
}

/**
 * Raw employee rows (as people/client.js `employees()` returns them) -> a frozen index.
 *
 * Throws DirectoryError('MALFORMED' | 'TOO_LARGE') for a response it cannot index at all; every
 * per-record problem is counted in `issues` and handled by exclusion, never by guessing.
 */
export function buildEmployeeIndex(rows) {
  if (!Array.isArray(rows)) throw new DirectoryError('MALFORMED');
  if (rows.length > MAX_DIRECTORY_RECORDS) throw new DirectoryError('TOO_LARGE');

  const issues = Object.fromEntries(PROBLEM_CODES.map((c) => [c, 0]));
  const counted = [];
  for (const raw of rows) {
    const { entry, problems } = transformEmployeeIdentity(raw);
    for (const p of problems) issues[p] += 1;
    if (entry) counted.push(entry);
  }

  // ---- canonical ids: a duplicated __recordId means neither record can be trusted ----
  const idCount = new Map();
  for (const e of counted) idCount.set(e.recordId, (idCount.get(e.recordId) || 0) + 1);
  const unique = counted.filter((e) => {
    if (idCount.get(e.recordId) === 1) return true;
    issues.duplicate_record_id += 1;
    return false;
  });
  const known = new Set(unique.map((e) => e.recordId));

  // ---- manager links: dropped unless they point at a record that is in the directory ----
  const entries = unique.map((e) => {
    if (e.managerRecordId && !known.has(e.managerRecordId)) {
      issues.unknown_manager += 1;
      return Object.freeze({ ...e, managerRecordId: null });
    }
    return e;
  });

  const byRecordId = new Map(entries.map((e) => [e.recordId, e]));

  // ---- ZUIDs: one account, one employee — or nobody ----
  const zuidCount = new Map();
  for (const e of entries) if (e.zuid) zuidCount.set(e.zuid, (zuidCount.get(e.zuid) || 0) + 1);
  const duplicateZuids = new Set([...zuidCount].filter(([, c]) => c > 1).map(([z]) => z));
  issues.duplicate_zuid = entries.filter((e) => e.zuid && duplicateZuids.has(e.zuid)).length;
  const byZuid = new Map(entries.filter((e) => e.zuid && !duplicateZuids.has(e.zuid)).map((e) => [e.zuid, e]));

  // ---- reporting lines: active reports only ----
  const reports = new Map();
  for (const e of entries) {
    if (!e.managerRecordId || !e.active) continue;
    if (!reports.has(e.managerRecordId)) reports.set(e.managerRecordId, []);
    reports.get(e.managerRecordId).push(e.recordId);
  }
  for (const [k, v] of reports) reports.set(k, Object.freeze(v));

  const active = entries.filter((e) => e.active).length;
  const knownStatus = entries.filter((e) => e.status !== null).length;
  return Object.freeze({
    byRecordId,
    byZuid,
    duplicateZuids,
    reports,
    size: entries.length,
    counts: Object.freeze({
      received: rows.length,
      indexed: entries.length,
      active,
      inactive: knownStatus - active,
      missingStatus: entries.length - knownStatus,
    }),
    issues: Object.freeze(issues),
  });
}

/**
 * The directory over a loader.
 *
 * @param loadRecords  () => Promise<rawRows>  — in live mode, the service-account client's
 *                     `employees()`; injected so every behaviour is testable with no network.
 */
export function createEmployeeDirectory({
  loadRecords,
  now = () => Date.now(),
  ttlMs = DIRECTORY_MAX_TTL_MS,
  failureCooldownMs = DIRECTORY_FAILURE_COOLDOWN_MS,
  logger = null,
}) {
  if (typeof loadRecords !== 'function') throw new Error('employee directory: loadRecords is required');
  const ttl = Math.min(Math.max(Number(ttlMs) || 0, 1), DIRECTORY_MAX_TTL_MS);

  let snapshot = null;          // { index, loadedAt }
  let inFlight = null;          // the shared refresh promise
  let failedAt = null;          // when the last refresh failed
  let generation = 0;           // bumped by invalidate(): a refresh begun earlier is not kept

  const log = (level, event, detail = {}) => { logger?.[level]?.({ event, ...detail }); };

  async function current() {
    const t = now();
    if (snapshot && t - snapshot.loadedAt < ttl) return snapshot.index;
    snapshot = null;              // expired: dropped BEFORE refreshing, so it can never be served
    if (failedAt !== null && t - failedAt < failureCooldownMs) throw new DirectoryError('COOLDOWN');

    if (!inFlight) {
      const gen = generation;
      inFlight = (async () => {
        try {
          const index = buildEmployeeIndex(await loadRecords());
          if (gen === generation) { snapshot = { index, loadedAt: now() }; failedAt = null; }
          log('info', 'directory.refreshed', { counts: index.counts, issues: index.issues });
          return index;
        } catch (err) {
          failedAt = now();
          // A code, never the error's text: a Zoho error body can echo request details.
          const code = err?.code && /^[A-Z_]{2,40}$/.test(String(err.code)) ? err.code : (err?.status ? `HTTP_${err.status}` : 'LOAD_FAILED');
          log('warn', 'directory.refresh_failed', { code });
          throw new DirectoryError('UNAVAILABLE');
        } finally {
          inFlight = null;
        }
      })();
    }
    return inFlight;
  }

  /** Run `fn(index)`, turning any load failure into UNAVAILABLE — never a stale answer. */
  async function withIndex(fn) {
    let index;
    try { index = await current(); } catch { return { ok: false, reason: LOOKUP.UNAVAILABLE }; }
    return fn(index);
  }

  return {
    /**
     * A ZUID -> exactly one ACTIVE employee, or a refusal reason. What sign-in will call (E5).
     * An invalid ZUID is refused before anything is loaded.
     */
    async resolveZuid(zuid) {
      const z = exactId(zuid);
      if (!z) return { ok: false, reason: LOOKUP.INVALID_ID };
      return withIndex((index) => {
        if (index.duplicateZuids.has(z)) return { ok: false, reason: LOOKUP.DUPLICATE_ZUID };
        const employee = index.byZuid.get(z);
        if (!employee) return { ok: false, reason: LOOKUP.NOT_LINKED };
        if (!employee.active) return { ok: false, reason: LOOKUP.INACTIVE };
        return { ok: true, employee };
      });
    },

    /** A __recordId -> the employee (active or not — the caller decides), or a refusal reason. */
    async getEmployee(recordId) {
      const id = exactId(recordId);
      if (!id) return { ok: false, reason: LOOKUP.INVALID_ID };
      return withIndex((index) => {
        const employee = index.byRecordId.get(id);
        return employee ? { ok: true, employee } : { ok: false, reason: LOOKUP.NOT_FOUND };
      });
    },

    /** A manager's ACTIVE direct reports, by exact __recordId. Empty for someone with none. */
    async reportsOf(recordId) {
      const id = exactId(recordId);
      if (!id) return { ok: false, reason: LOOKUP.INVALID_ID };
      return withIndex((index) => ({ ok: true, reports: index.reports.get(id) || [] }));
    },

    /** Drop the snapshot now (e.g. after a known org change). */
    invalidate() {
      generation += 1;
      snapshot = null;
    },

    /** Aggregate state for diagnostics. Counts only — no ids, no names. */
    status() {
      const t = now();
      return {
        loaded: Boolean(snapshot),
        ageMs: snapshot ? t - snapshot.loadedAt : null,
        ttlMs: ttl,
        coolingDown: failedAt !== null && t - failedAt < failureCooldownMs,
        counts: snapshot?.index.counts ?? null,
        issues: snapshot?.index.issues ?? null,
      };
    },
  };
}
