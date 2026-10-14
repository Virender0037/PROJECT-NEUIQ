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
 * Keyed by caller, always. Two employees issuing the identical spec must not share a cache entry;
 * that is a data leak rather than a stale read. `cacheKey()` refuses to build a key without a
 * caller, so this cannot be forgotten here.
 */
import { cache, cacheKey } from '../../../core/platform/cache.js';
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

export function buildLiveSources({ client, now = () => new Date() }) {
  /** Cache a fetch under a caller-scoped key. */
  const cached = (user, parts, loader) =>
    cache.wrap(cacheKey(user?.employeeId || 'anonymous', ...parts), TTL_SECONDS, loader);

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
      async fetchRows({ user, signal }) {
        // Every page or a throw (people/client.js) — a failed walk is never cached (cache.wrap
        // keeps no rejection), so the next request walks again instead of serving a partial list.
        return cached(user, ['employees'], async () => {
          const raw = await client.employees({ signal });
          return transformEmployeeRecords(raw);
        });
      },
    },
  };
}

export { defaultWindow, WINDOW_MONTHS, TTL_SECONDS };
