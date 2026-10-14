/**
 * The Zoho People API client.
 *
 * Three methods, one per confirmed endpoint. Paths and parameter names come from endpoints.js,
 * which records what has actually returned 200; dates convert through transformers/dates.js; and
 * envelopes unwrap through transformers/envelope.js. Nothing here builds a URL by hand or formats
 * a date inline, because those are the two things that fail silently.
 *
 * Each method returns RAW rows. Field mapping is the transformers' job and is kept separate so
 * that a module with no observed field names — attendance — can still have a working request path.
 */
import { createZohoClient } from '../_shared/client.js';
import { endpoint, dataSelectFor } from './endpoints.js';
import { dateRangeParams, toZohoDate } from './transformers/dates.js';
import { unwrapV3, classifyFormsPage } from './transformers/envelope.js';
import { isZohoRecordId, LeaveBalanceUnavailableError, BALANCE_UNAVAILABLE } from './transformers/balance.js';
import { createRateLimiter } from '../_shared/rateLimiter.js';

/**
 * The Booked and Balance limiter: 20 a minute against Zoho's documented 30, and the documented
 * two-minute lockout once Zoho says 429. Headroom because the limit is per process (see
 * rateLimiter.js) and a lockout stops every user's balance, not one.
 */
export const BALANCE_RATE_LIMIT = Object.freeze({ limit: 20, windowMs: 60_000, lockoutMs: 120_000 });

/**
 * Employee pagination. `getRecords` takes `sIndex` (1-based) and `limit` (documented maximum 200);
 * both were confirmed honoured on 2026-10-14 (see endpoints.js). Zoho documents no total count and
 * no end-of-list signal, so the walk below stops only on evidence it can check.
 *
 *   EMPLOYEE_PAGE_SIZE      Zoho's documented maximum. Fixed — a smaller page only costs requests.
 *   DIRECTORY_MAX_RECORDS   hard ceiling; equals MAX_DIRECTORY_RECORDS in employeeDirectory.js.
 *   DIRECTORY_MAX_PAGES     hard ceiling on FULL pages (50 × 200 = the record ceiling). One more
 *                           request is allowed after the last full page, only to read the end.
 *   DIRECTORY_DEADLINE_MS   the whole walk, every page included.
 *
 * Callers may pass LOWER limits; anything higher is clamped to these.
 */
export const EMPLOYEE_PAGE_SIZE = 200;
export const DIRECTORY_MAX_RECORDS = 10_000;
export const DIRECTORY_MAX_PAGES = DIRECTORY_MAX_RECORDS / EMPLOYEE_PAGE_SIZE;
export const DIRECTORY_DEADLINE_MS = 60_000;

/**
 * Page requests share a local limiter, like the balance report. Zoho publishes no per-minute limit
 * for getRecords — only plan-wide daily totals — so this is headroom for one full walk (50 pages +
 * the end read) per minute, and the documented two-minute lockout once Zoho says 429.
 */
export const DIRECTORY_PAGE_RATE_LIMIT = Object.freeze({ limit: DIRECTORY_MAX_PAGES + 1, windowMs: 60_000, lockoutMs: 120_000 });

/** Why a walk was abandoned. Codes only — safe to log, never carrying an id. */
export const PAGINATION = Object.freeze({
  PAGE_LIMIT: 'PAGINATION_PAGE_LIMIT',             // still full pages after the page ceiling
  RECORD_LIMIT: 'PAGINATION_RECORD_LIMIT',         // more records than the record ceiling
  DUPLICATE_RECORD: 'PAGINATION_DUPLICATE_RECORD', // a __recordId seen twice, on one page or across pages
  REPEATED_PAGE: 'PAGINATION_REPEATED_PAGE',       // a page identical to the one before it
  EMPTY_PAGE: 'PAGINATION_EMPTY_PAGE',             // status 0 with no records: never observed
  NO_RECORDS_ON_FIRST_PAGE: 'PAGINATION_NO_RECORDS_ON_FIRST_PAGE', // 7024 before any page: unverified as "empty"
  OVERSIZED_PAGE: 'PAGINATION_OVERSIZED_PAGE',     // more records than the limit asked for
  UNEXPECTED_RESPONSE: 'PAGINATION_UNEXPECTED_RESPONSE', // any shape classifyFormsPage refuses
  TIMEOUT: 'PAGINATION_TIMEOUT',                   // the whole walk ran past its deadline
});

class EmployeePaginationError extends Error {
  constructor(code, detail = {}) {
    super(`zoho.people employees: ${code}`);
    this.name = 'EmployeePaginationError';
    this.code = code;
    this.status = 502;
    Object.assign(this, detail);   // counts only
  }
}

const clampLimit = (value, ceiling) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, ceiling) : ceiling;
};

export function createPeopleClient({
  dc, tokenProvider, fetchImpl, logger, requestId = null,
  balanceLimiter = createRateLimiter({ name: 'Zoho leave balance', ...BALANCE_RATE_LIMIT }),
  directoryLimiter = createRateLimiter({ name: 'Zoho employee pages', ...DIRECTORY_PAGE_RATE_LIMIT }),
  directoryLimits = {},
  now = () => Date.now(),
}) {
  const limits = Object.freeze({
    maxPages: clampLimit(directoryLimits.maxPages, DIRECTORY_MAX_PAGES),
    maxRecords: clampLimit(directoryLimits.maxRecords, DIRECTORY_MAX_RECORDS),
    deadlineMs: clampLimit(directoryLimits.deadlineMs, DIRECTORY_DEADLINE_MS),
  });
  // Same default as the HTTP client below: an unset logger means the console.
  const note = (event, detail) => (logger ?? console).log?.(JSON.stringify({ event, requestId, ...detail }));
  const http = createZohoClient({ product: 'people', dc, tokenProvider, fetchImpl, logger });

  return {
    /**
     * The Booked and Balance report for exactly ONE employee, over [from, to] (ISO dates).
     *
     * Returns the raw body; transformers/balance.js reads it. Refuses — before any request — an
     * id that is not a Zoho erecno, so nothing but a single verified id is ever sent and there is
     * no path to an organisation-wide report. Not retried on 5xx (see endpoints.js), and
     * rate-limited locally so this endpoint never trips Zoho's two-minute lockout.
     */
    async leaveBalance({ employeeId, from, to, signal }) {
      if (!isZohoRecordId(employeeId)) {
        throw new LeaveBalanceUnavailableError(BALANCE_UNAVAILABLE.NOT_LINKED, 'this account is not linked to a Zoho People employee record.');
      }
      const ep = endpoint('people.leave.balance');
      const params = {
        from: toZohoDate(from),
        to: toZohoDate(to),
        unit: 'Day',
        employee: JSON.stringify([employeeId]),
      };
      balanceLimiter.acquire();
      try {
        return await http.get(ep.path, { params, signal, requestId, retry: ep.retryOn5xx });
      } catch (err) {
        if (err?.status === 429) balanceLimiter.lockout(err.retryAfterSeconds);
        throw err;
      }
    },

    /** Limiter state, for tests and diagnostics. Counts only. */
    balanceLimitStatus: () => balanceLimiter.status(),

    /**
     * EVERY employee form record, page by page — or a throw. Never a partial list.
     *
     * Pages are read one at a time, `sIndex = 1, 201, 401, …` with `limit = 200`:
     *
     *   rows, fewer than 200   the last page: done
     *   rows, exactly 200      read the next page
     *   7024 "No records"      done — but ONLY directly after a full page, the one position the
     *                          observed shape was recorded in. On the FIRST page it is refused
     *                          (NO_RECORDS_ON_FIRST_PAGE): no empty organisation has been
     *                          observed, and Zoho's generic "No records found" there could as
     *                          easily mean a scope or form problem — reporting "no employees"
     *                          would turn that into a confident wrong answer
     *   anything else          throw: another Zoho error, any HTTP failure, a malformed body,
     *                          status 0 with no records, a page larger than asked for, a
     *                          __recordId seen before, a page identical to the previous one,
     *                          the page / record ceilings, or the overall deadline
     *
     * Whatever was collected before a failure is discarded with it; the caller gets an error, not
     * a shorter list. 5xx and 429 are NOT retried (`retry: false`) — a retry would spend the
     * organisation's request budget on one page of a walk that the directory can simply re-run
     * after its cool-down — and a 429 locks the local limiter. The 401 token refresh is unchanged.
     *
     * Known limit — this is NOT a guaranteed snapshot. Zoho returns no record count and no
     * snapshot or cursor, so completeness cannot be proven: a 7024 sent for any other reason
     * directly after a full page is indistinguishable from the real end, and records that move
     * between pages while the walk runs can be missed. Duplicates are caught; omissions cannot be.
     */
    async employees({ signal } = {}) {
      const ep = endpoint('people.employee.records');
      const started = now();
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(), limits.deadlineMs);
      const onAbort = () => deadline.abort();
      signal?.addEventListener('abort', onAbort, { once: true });

      const rows = [];
      const seen = new Set();
      let previousPage = null;
      let pages = 0;
      const fail = (code) => {
        note('zoho.people.employees.failed', { code, pages, records: rows.length });
        return new EmployeePaginationError(code, { pages, records: rows.length });
      };

      try {
        for (;;) {
          if (now() - started >= limits.deadlineMs || deadline.signal.aborted) throw fail(PAGINATION.TIMEOUT);

          const sIndex = pages * EMPLOYEE_PAGE_SIZE + 1;
          directoryLimiter.acquire();
          let body;
          try {
            body = await http.get(ep.path, {
              params: { sIndex, limit: EMPLOYEE_PAGE_SIZE },
              signal: deadline.signal,
              requestId,
              retry: false,
            });
          } catch (err) {
            if (err?.status === 429) directoryLimiter.lockout(err.retryAfterSeconds);
            if (deadline.signal.aborted && !signal?.aborted) throw fail(PAGINATION.TIMEOUT);
            note('zoho.people.employees.failed', { code: err?.code ?? (err?.status ? `HTTP_${err.status}` : 'REQUEST_FAILED'), pages, records: rows.length });
            throw err;
          }

          let page;
          try { page = classifyFormsPage(body); } catch { throw fail(PAGINATION.UNEXPECTED_RESPONSE); }

          // The end of the list: the observed 7024, in the only position it was observed to mean
          // that — directly after a full page (a short page returns below, so reaching here with
          // pages > 0 means the previous one was full). Before any page it proves nothing.
          if (page.kind === 'noRecords') {
            if (pages === 0) throw fail(PAGINATION.NO_RECORDS_ON_FIRST_PAGE);
            break;
          }

          // At most `maxPages` FULL pages. The request after the last of them may only read the end;
          // if it brings rows instead, the directory is larger than the ceiling.
          if (pages >= limits.maxPages) throw fail(PAGINATION.PAGE_LIMIT);

          const pageRows = page.rows;
          if (pageRows.length === 0) throw fail(PAGINATION.EMPTY_PAGE);
          if (pageRows.length > EMPLOYEE_PAGE_SIZE) throw fail(PAGINATION.OVERSIZED_PAGE);

          const ids = pageRows.map((r) => r.__recordId);
          if (previousPage && ids.length === previousPage.length && ids.every((id, i) => id === previousPage[i])) {
            throw fail(PAGINATION.REPEATED_PAGE);
          }
          for (const id of ids) {
            if (seen.has(id)) throw fail(PAGINATION.DUPLICATE_RECORD);
            seen.add(id);
          }
          if (rows.length + pageRows.length > limits.maxRecords) throw fail(PAGINATION.RECORD_LIMIT);

          rows.push(...pageRows);
          pages += 1;
          previousPage = ids;
          if (pageRows.length < EMPLOYEE_PAGE_SIZE) break;
        }
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }

      note('zoho.people.employees.loaded', { pages, records: rows.length, ms: now() - started });
      return rows;
    },

    /**
     * Leave records in a date range.
     *
     * `data_select` comes from dataSelectFor(), which returns ALL under the service-account model
     * — see the warning there. Scoping to the caller happens in core/policy/scope.js, and with
     * ALL there is no second fence behind it.
     */
    async leaves({ from, to, user, signal }) {
      const ep = endpoint('people.leave.list');
      const body = await http.get(ep.path, {
        params: { ...dateRangeParams(from, to), data_select: dataSelectFor(user) },
        signal,
        requestId,
      });
      return unwrapV3(body).rows;
    },

    /**
     * Attendance entries for one employee.
     *
     * The request layer is complete and validated. Callers get raw rows; transforming them is not
     * possible yet (transformers/attendance.js) because no non-empty response has been seen.
     *
     * `employeeEmailId` is required by the endpoint, and it is the reason the identity chain needs
     * an email: leave addresses employees by erecno, attendance by email, and nothing joins the
     * two without the employee record.
     */
    async attendanceEntries({ employeeEmailId, from, to, signal }) {
      if (!employeeEmailId) {
        const e = new Error('attendance: employee_email_id is required by this endpoint');
        e.status = 400;
        throw e;
      }
      const ep = endpoint('people.attendance.entries');
      const body = await http.get(ep.path, {
        params: { employee_email_id: employeeEmailId, ...dateRangeParams(from, to) },
        signal,
        requestId,
      });
      return unwrapV3(body).rows;
    },
  };
}
