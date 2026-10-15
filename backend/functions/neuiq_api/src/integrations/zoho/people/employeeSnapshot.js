/**
 * The shared employee-directory snapshot — ONE complete organisation-wide employee list per
 * deployment namespace, loaded once and reused by every server-side consumer (E2.2).
 *
 * Before E2.2 four consumers each walked the whole directory on their own: the E2 identity
 * directory (every 5 min), the live `employees` query source (per admin, per 5 min), and live
 * `headcount` and `employeeLookup` (on EVERY call, uncached). At 10,000 employees one walk is 51
 * requests; four independent walkers multiplied that for no benefit. Now they share this.
 *
 * ## What this guarantees — the rules moved here intact from employeeDirectory.js (E2)
 *
 *   fresh snapshot      served, to every consumer, without a request
 *   expired / none      ONE refresh; concurrent callers share the in-flight load (single-flight)
 *   expired             discarded BEFORE the refresh — never served while it runs, never after it fails
 *   refresh fails       every waiting caller gets the failure; for a cool-down further calls are
 *                       refused WITHOUT a request, so a Zoho outage is not met with a request storm
 *   invalidate()        drops the snapshot now; a refresh begun earlier is not kept
 *   partial / malformed never stored: `loadRecords` is the paged client walk, which throws rather
 *                       than return a shorter list (E2.1); a non-array or oversized result is refused
 *
 * ## What it is NOT
 *
 * Not an authorisation decision. The snapshot is the WHOLE organisation, server-side only. Holding
 * it grants nobody anything: every consumer applies the caller's own permissions before it reads
 * (adminOnly source, admin-only tool, `teamOf` before lookup), and no consumer caches a per-caller
 * answer here. It is never returned to a client: consumers transform and allow-list first.
 *
 * Not shared across processes. This is in-memory: N instances hold N snapshots and walk N times.
 * Horizontal scaling needs a shared store with a refresh lock (Catalyst Cache, or Data Store + a
 * lease) — see docs/backend/17-environment-isolation.md. Not built here.
 *
 * ## Errors
 *
 * A consumer never sees Zoho's error text: failures are re-raised as EmployeeSnapshotError with
 * the original STATUS kept — a real 403 stays a 403 (a permission answer), 429 stays 429, and
 * everything else is a 503 — and a CODE. Logs carry codes and counts, never ids, names or emails.
 */
export const SNAPSHOT_MAX_TTL_MS = 5 * 60 * 1000;
export const SNAPSHOT_FAILURE_COOLDOWN_MS = 30 * 1000;
/** Equal to the paged client's record ceiling (people/client.js DIRECTORY_MAX_RECORDS). */
export const SNAPSHOT_MAX_RECORDS = 10_000;

const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,47}$/;

export class EmployeeSnapshotError extends Error {
  constructor(code, status = 503) {
    super(status === 403
      ? 'Zoho People refused the employee directory read for this service account.'
      : 'The employee directory is unavailable right now.');
    this.name = 'EmployeeSnapshotError';
    this.code = code;
    this.status = status;
  }
}

/** Keep the status that is itself an answer (403, 429); everything else is "unavailable". */
const statusFor = (err) => (err?.status === 403 || err?.status === 429 ? err.status : 503);
const codeFor = (err) => {
  if (err?.code && SAFE_CODE.test(String(err.code))) return String(err.code);
  return err?.status ? `HTTP_${err.status}` : 'LOAD_FAILED';
};

/**
 * @param loadRecords        () => Promise<raw employee rows> — the paged client walk in live mode
 * @param namespace          the deployment namespace — a string, or a resolver read on EVERY get()
 *                           (the live manifest passes core/platform/deployment.js currentNamespace,
 *                           so an unbound process is refused and a snapshot from another namespace
 *                           is dropped, never served). Recorded on each snapshot.
 * @param ttlMs              clamped to SNAPSHOT_MAX_TTL_MS
 * @param failureCooldownMs  refusal window after a failed load
 */
export function createEmployeeSnapshot({
  loadRecords,
  namespace,
  now = () => Date.now(),
  ttlMs = SNAPSHOT_MAX_TTL_MS,
  failureCooldownMs = SNAPSHOT_FAILURE_COOLDOWN_MS,
  maxRecords = SNAPSHOT_MAX_RECORDS,
  logger = null,
}) {
  if (typeof loadRecords !== 'function') throw new Error('employee snapshot: loadRecords is required');
  if (!(typeof namespace === 'function' || (typeof namespace === 'string' && namespace))) {
    throw new Error('employee snapshot: a deployment namespace (or resolver) is required');
  }
  const resolveNamespace = () => {
    let ns;
    try { ns = typeof namespace === 'function' ? namespace() : namespace; } catch (err) {
      throw new EmployeeSnapshotError(err?.code && SAFE_CODE.test(String(err.code)) ? err.code : 'DEPLOYMENT_UNBOUND', 503);
    }
    if (typeof ns !== 'string' || !ns) throw new EmployeeSnapshotError('DEPLOYMENT_UNBOUND', 503);
    return ns;
  };
  const ttl = Math.min(Math.max(Number(ttlMs) || 0, 1), SNAPSHOT_MAX_TTL_MS);
  const ceiling = Math.min(Math.max(Number(maxRecords) || 0, 1), SNAPSHOT_MAX_RECORDS);

  let snapshot = null;          // the frozen snapshot object
  let inFlight = null;          // the shared load
  let failedAt = null;
  let lastFailure = null;       // { code, status } of the last failure, for the cool-down refusal
  let generation = 0;
  let loads = 0;

  const log = (level, event, detail = {}) => { logger?.[level]?.({ event, ...detail }); };

  function freeze(rows) {
    if (!Array.isArray(rows)) throw Object.assign(new Error('malformed'), { code: 'MALFORMED' });
    if (rows.length > ceiling) throw Object.assign(new Error('too large'), { code: 'TOO_LARGE' });
    // Shallow-frozen: consumers transform into new objects and must never mutate the shared rows.
    return Object.freeze(rows.map((r) => Object.freeze({ ...r })));
  }

  async function get() {
    const ns = resolveNamespace();
    const t = now();
    if (snapshot && snapshot.namespace !== ns) snapshot = null;   // another deployment's data: never served
    if (snapshot && t - snapshot.loadedAt < ttl) return snapshot;
    snapshot = null;              // expired: dropped BEFORE refreshing, so it can never be served
    if (failedAt !== null && t - failedAt < failureCooldownMs) {
      throw new EmployeeSnapshotError(lastFailure?.status === 403 ? 'DIRECTORY_FORBIDDEN' : 'DIRECTORY_COOLDOWN', lastFailure?.status === 403 ? 403 : 503);
    }

    if (!inFlight) {
      const gen = generation;
      loads += 1;
      const load = (async () => {
        try {
          const rows = freeze(await loadRecords());
          const next = Object.freeze({ namespace: ns, rows, size: rows.length, loadedAt: now(), generation: gen });
          if (gen === generation) { snapshot = next; failedAt = null; lastFailure = null; }
          log('info', 'employee_snapshot.loaded', { namespace: ns, records: rows.length });
          return next;
        } catch (err) {
          const failure = { code: codeFor(err), status: statusFor(err) };
          // A load invalidated while it ran must not put the NEW generation into cool-down.
          if (gen === generation) { failedAt = now(); lastFailure = failure; }
          log('warn', 'employee_snapshot.load_failed', { namespace: ns, code: failure.code });
          throw new EmployeeSnapshotError(failure.code, failure.status);
        } finally {
          // Only clear OUR load: after invalidate() a newer one may already be in flight.
          if (inFlight === load) inFlight = null;
        }
      })();
      inFlight = load;
    }
    return inFlight;
  }

  return {
    get,
    /**
     * Drop the snapshot now. A load already in flight completes for the callers already waiting on
     * it but is not kept — and callers arriving AFTER this start a fresh load rather than join it.
     */
    invalidate() {
      generation += 1;
      snapshot = null;
      inFlight = null;
    },
    /** Counts only — no ids, no names. */
    status() {
      const t = now();
      return {
        namespace: snapshot?.namespace ?? null,
        loaded: Boolean(snapshot),
        ageMs: snapshot ? t - snapshot.loadedAt : null,
        ttlMs: ttl,
        records: snapshot?.size ?? null,
        coolingDown: failedAt !== null && t - failedAt < failureCooldownMs,
        loads,
      };
    },
  };
}

/**
 * A consumer's guard: refuse a snapshot from another namespace rather than read it. `expected` is a
 * namespace string, a resolver, or null (a private snapshot nobody else can reach).
 */
export function assertSnapshotNamespace(snap, expected) {
  const want = typeof expected === 'function' ? expected() : expected;
  if (want && snap?.namespace !== want) {
    throw new EmployeeSnapshotError('NAMESPACE_MISMATCH', 503);
  }
  return snap;
}
