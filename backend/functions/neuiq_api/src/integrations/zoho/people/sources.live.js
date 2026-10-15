/**
 * Query sources backed by the live Zoho People API.
 *
 * The same three source keys, the same group and numeric field lists, and the same `scope`
 * functions as the seed-backed definitions in sources.js — because a dashboard saved against one
 * must resolve against the other. What differs is only where rows come from: `fetchRows(ctx)`
 * instead of `rows()`.
 *
 * `runQueryAsync` in core/query/engine.js calls `fetchRows` and then runs the identical
 * whitelisting, scoping and aggregation as the seed path. There is no second copy of the rules.
 *
 * ## The date window
 *
 * The leave endpoint requires `from_date` and `to_date`, but a QuerySpec has no notion of a date
 * range — it groups by month and expects the source to supply history. So the source picks a
 * window: six months back, matching what seed.js generates, so a chart looks the same shape
 * against either source rather than mysteriously covering a different period.
 *
 * ## Caching
 *
 * Keyed by deployment namespace AND caller, always. Two employees issuing the identical spec must
 * not share a cache entry — that is a data leak rather than a stale read — and no entry may ever be
 * a hit in another deployment. `scopedCacheKey()` refuses a key without either. A request with no
 * caller id is refused; there is no 'anonymous' shared key any more (E2.2).
 *
 * The `employees` source is the exception that caches NOTHING per caller: it reads the deployment's
 * shared employee snapshot (employeeSnapshot.js). That snapshot is organisation-wide and server-side;
 * the source is adminOnly, so the query engine refuses everyone else BEFORE `fetchRows` runs.
 */
import { cache, scopedCacheKey } from '../../../core/platform/cache.js';
import { currentNamespace } from '../../../core/platform/deployment.js';
import { createEmployeeSnapshot, assertSnapshotNamespace } from './employeeSnapshot.js';
import { transformLeaveRecords } from './transformers/leave.js';
import { transformEmployeeRecords } from './transformers/employee.js';
import { AttendanceTransformerPendingError } from './transformers/attendance.js';
import { PEOPLE_SOURCES } from './sources.js';

/** How far back a dashboard looks. Matches the seed's six-month window. */
const WINDOW_MONTHS = 6;

/** Rows change slowly relative to how often a dashboard is opened. */
const TTL_SECONDS = 300;

const iso = (d) => d.toISOString().slice(0, 10);

/** The default range, relative rather than absolute — a fixed range would freeze as time passes. */
function defaultWindow(now = new Date()) {
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCMonth(from.getUTCMonth() - WINDOW_MONTHS);
  return { from: iso(from), to: iso(to) };
}

/**
 * @param client            the People client
 * @param namespace         the deployment namespace, or a resolver; defaults to the process's bound
 *                          deployment (core/platform/deployment.js) — refused while unbound
 * @param employeeSnapshot  the deployment's SHARED employee snapshot; a private one is made if absent
 */
export function buildLiveSources({ client, now = () => new Date(), namespace = currentNamespace, employeeSnapshot = null }) {
  const ns = () => (typeof namespace === 'function' ? namespace() : namespace);
  const snapshot = employeeSnapshot ?? createEmployeeSnapshot({ loadRecords: () => client.employees(), namespace: ns });
  /** The transformed directory, computed once per snapshot rather than once per query. */
  const transformed = new WeakMap();

  /** Cache a fetch under a namespace- and caller-scoped key. No caller, no cache, no read. */
  const cached = (user, parts, loader) => {
    if (!user?.employeeId) {
      throw Object.assign(new Error('Sign in to continue.'), { status: 401 });
    }
    return cache.wrap(scopedCacheKey(ns(), user.employeeId, ...parts), TTL_SECONDS, loader);
  };

  return {
    leave: {
      ...PEOPLE_SOURCES.leave,
      rows: undefined,
      async fetchRows({ user, signal }) {
        const { from, to } = defaultWindow(now());
        // The window is part of the key: a different range is a different question.
        return cached(user, ['leave', from, to], async () => {
          const raw = await client.leaves({ from, to, user, signal });
          return transformLeaveRecords(raw);
        });
      },
    },

    attendance: {
      ...PEOPLE_SOURCES.attendance,
      rows: undefined,
      /**
       * Refuses while the attendance transformer is pending.
       *
       * Deliberately not an empty array. An empty result is indistinguishable from "this employee
       * has no attendance", and quietly reporting zero hours is worse than reporting that the
       * capability is not built. Surfaces as 501, not 500 — it is a missing capability, not a
       * fault.
       */
      async fetchRows() {
        throw new AttendanceTransformerPendingError();
      },
    },

    employees: {
      ...PEOPLE_SOURCES.employees,
      rows: undefined,
      async fetchRows({ user }) {
        // The shared snapshot: complete or an error (people/client.js + employeeSnapshot.js) — a
        // failed load is never stored, and a snapshot from another namespace is refused. Nothing
        // here is per caller: the engine has already refused every non-admin (adminOnly source).
        if (!user?.employeeId) throw Object.assign(new Error('Sign in to continue.'), { status: 401 });
        const snap = assertSnapshotNamespace(await snapshot.get(), ns);
        if (!transformed.has(snap)) transformed.set(snap, transformEmployeeRecords(snap.rows));
        return transformed.get(snap);
      },
    },
  };
}

export { defaultWindow, WINDOW_MONTHS, TTL_SECONDS };
