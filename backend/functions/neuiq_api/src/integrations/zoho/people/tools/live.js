/**
 * Zoho People tools backed by the live API.
 *
 * The same six names, scopes, params and sentences as the seed tools in ./index.js. Only the body
 * of `run` differs: it awaits the client instead of filtering an in-memory array.
 *
 * ## Why there are two implementations rather than one parameterised set
 *
 * The seed tools are synchronous and 65 assertions call them directly and read properties off the
 * result. Making them async to share one body would have meant editing every one of those
 * assertions — changing tests to fit an implementation detail, on the suite that guards the
 * security boundaries. The duplication is real and worth removing later; converging it belongs
 * with a phase that can update the tests deliberately rather than as collateral.
 *
 * What must NOT diverge is the contract: same names, same scopes, same params, same `say()`. Both
 * sets go through the identical registry, the identical `mayCall`, and the identical
 * `resolveSubject`. A test asserts the two catalogues match.
 *
 * ## `say()` is still the guarantee
 *
 * The model picks a tool; the tool fetches; `say()` writes the sentence. That is why a wrong
 * figure here is a code bug rather than a hallucination, and it is unchanged by the data coming
 * over a network.
 */
import { resolveSubject } from '../../../../core/policy/authorize.js';
import {
  PEOPLE_TOOLS, PERSON_FIELDS, ON_LEAVE_FIELDS, LEAVE_RECORD_FIELDS, pick,
} from './index.js';
import { teamOf, isWithin } from '../../../../core/policy/authorize.js';
import { isApprovedLeave, matchesLeaveStatus } from '../leaveStatus.js';
import { transformLeaveRecords } from '../transformers/leave.js';
import { transformEmployeeRecords } from '../transformers/employee.js';
import { AttendanceTransformerPendingError } from '../transformers/attendance.js';
import {
  transformLeaveBalanceReport, isZohoRecordId, LeaveBalanceUnavailableError, BALANCE_UNAVAILABLE,
} from '../transformers/balance.js';
import { leaveBalancePeriod, LEAVE_YEAR_ENV } from '../leaveYear.js';
import { defaultWindow } from '../sources.live.js';
import { cache as sharedCache, scopedCacheKey } from '../../../../core/platform/cache.js';
import { currentNamespace } from '../../../../core/platform/deployment.js';
import { createEmployeeSnapshot, assertSnapshotNamespace } from '../employeeSnapshot.js';

/** A balance changes when leave is booked or approved — minutes, not seconds, is fresh enough. */
export const BALANCE_TTL_SECONDS = 300;

/** Reuse the seed tool's declaration, replace only its body. Keeps the contract identical. */
const from = (name, run) => ({ ...PEOPLE_TOOLS[name], run });

/**
 * @param namespace         the deployment namespace, or a resolver; defaults to the process's bound
 *                          deployment (core/platform/deployment.js) — refused while unbound
 * @param employeeSnapshot  the deployment's SHARED employee snapshot (E2.2): `headcount` and
 *                          `employeeLookup` read it instead of walking Zoho on every call. A private
 *                          one is made when absent. It grants nothing — each tool still applies the
 *                          caller's reach before reading (admin-only `headcount` via mayCall,
 *                          `teamOf` before `employeeLookup` reads anything).
 */
export function buildLiveTools({
  client,
  now = () => new Date(),
  leaveYearStart = undefined,
  balanceCache = sharedCache,
  namespace = currentNamespace,
  employeeSnapshot = null,
}) {
  const ns = () => (typeof namespace === 'function' ? namespace() : namespace);
  const snapshot = employeeSnapshot ?? createEmployeeSnapshot({ loadRecords: () => client.employees(), namespace: ns });
  /** The transformed directory, once per snapshot — never per caller, and never returned whole. */
  const transformed = new WeakMap();
  async function employeeRows() {
    const snap = assertSnapshotNamespace(await snapshot.get(), ns);
    if (!transformed.has(snap)) transformed.set(snap, transformEmployeeRecords(snap.rows));
    return transformed.get(snap);
  }

  /** Leave rows for one employee over the default window, already normalized. */
  async function leaveFor(employeeId, signal) {
    const { from: f, to } = defaultWindow(now());
    const raw = await client.leaves({ from: f, to, user: { employeeId }, signal });
    return transformLeaveRecords(raw).filter((r) => r.employeeId === employeeId);
  }

  return {
    /**
     * Leave balance — Zoho's own figure from the Booked and Balance report. Nothing is computed.
     *
     * This replaced a balance summed from leave requests against INVENTED entitlement constants
     * ({Casual: 12, Sick: 8, ...}) that matched none of the organisation's real leave types. It
     * fails closed at every step, and every refusal happens before a request is made:
     *
     *   1. resolveSubject   who may be asked about — the existing rule, unchanged. A chat argument
     *                       only ever selects among ids the caller is already allowed to see.
     *   2. isZohoRecordId   the subject must be a Zoho erecno (__recordId). A seed id, an email or
     *                       a rounded number is refused: NOT_LINKED.
     *   3. period           the configured leave year (leaveYear.js). Unset: PERIOD_NOT_CONFIGURED.
     *   4. cache            keyed by caller, subject and period — never shared across any of them.
     *   5. client           one employee, rate-limited, no 5xx retry.
     *   6. transformer      anything incomplete is unavailable, never zero.
     *
     * On any failure the error surfaces. There is no fallback figure, seed or otherwise.
     */
    'zohoPeople.leaveBalance': from('zohoPeople.leaveBalance', async ({ employeeId, leaveType }, user) => {
      const id = resolveSubject(user, employeeId);
      if (!isZohoRecordId(id)) {
        throw new LeaveBalanceUnavailableError(BALANCE_UNAVAILABLE.NOT_LINKED, 'this account is not linked to a Zoho People employee record.');
      }
      const period = leaveBalancePeriod(leaveYearStart, now());
      if (!period) {
        throw new LeaveBalanceUnavailableError(
          BALANCE_UNAVAILABLE.PERIOD_NOT_CONFIGURED,
          `the organisation's leave year is not configured. Set ${LEAVE_YEAR_ENV}=MM-DD (e.g. 01-01 or 04-01).`,
        );
      }

      // Caller AND subject AND period: a manager's cached view of a report never answers the
      // report themselves, and last leave year's figures never answer this one.
      const key = scopedCacheKey(ns(), user.employeeId, 'leave-balance', id, period.from, period.to);
      const rows = await balanceCache.wrap(key, BALANCE_TTL_SECONDS, async () => transformLeaveBalanceReport(
        await client.leaveBalance({ employeeId: id, from: period.from, to: period.to }),
        { employeeId: id },
      ));

      const wanted = leaveType ? String(leaveType).trim().toLowerCase() : null;
      const balances = rows
        .filter((r) => !wanted || r.leaveType.toLowerCase() === wanted)
        .map((r) => pick(r, ['leaveType', 'category', 'unit', 'balance', 'booked']));

      return {
        employeeId: id,
        dataSource: 'zoho',
        period,
        requestedLeaveType: leaveType || null,
        balances,
      };
    }),

    'zohoPeople.leaveRecords': from('zohoPeople.leaveRecords', async ({ employeeId, status, limit }, user) => {
      const id = resolveSubject(user, employeeId);
      let rows = await leaveFor(id);
      if (status) rows = rows.filter((l) => matchesLeaveStatus(l, status));
      rows = rows.sort((a, b) => String(b.from).localeCompare(String(a.from))).slice(0, Math.min(Number(limit) || 10, 50));
      return {
        employeeId: id,
        count: rows.length,
        records: rows.map((l) => pick(l, LEAVE_RECORD_FIELDS)),
      };
    }),

    /**
     * Attendance. Refuses while the transformer is pending rather than reporting zero hours —
     * "no data" and "not built" are different answers and must not look alike.
     */
    'zohoPeople.attendanceSummary': from('zohoPeople.attendanceSummary', async ({ employeeId }, user) => {
      resolveSubject(user, employeeId);
      throw new AttendanceTransformerPendingError();
    }),

    /**
     * The caller's direct reports, or everyone for an HR admin.
     *
     * The leave request goes out as `data_select=ALL`, so this filter is the only thing between a
     * manager and the whole organisation's absences — Zoho narrows nothing. `teamOf` runs BEFORE
     * the fetch, so a caller whose team cannot be determined (all of live mode, until a reporting
     * field is confirmed) is refused without a request being made.
     */
    'zohoPeople.teamOnLeave': from('zohoPeople.teamOnLeave', async (_args, user) => {
      const team = teamOf(user);
      const today = now().toISOString().slice(0, 10);
      const { from: f, to } = defaultWindow(now());
      const raw = await client.leaves({ from: f, to, user, signal: undefined });
      const people = transformLeaveRecords(raw)
        .filter((l) => isWithin(team, l.employeeId))
        .filter((l) => isApprovedLeave(l) && l.from <= today && (l.to ?? l.from) >= today)
        .slice(0, 6)
        .map((l) => pick({ ...l, name: l.employeeName || l.employeeId }, ON_LEAVE_FIELDS));
      return { date: today, people };
    }),

    /**
     * Headcount.
     *
     * **Only `department` is groupable on live data.** The captured employee payload has no
     * location or designation field, so grouping by either would bucket every employee under
     * `undefined` and report a single bar labelled "undefined" — a chart that looks like an
     * answer and is not one. Asking for one of those falls back to department and says so in
     * `groupBy`, which the sentence then reports honestly.
     */
    'zohoPeople.headcount': from('zohoPeople.headcount', async ({ groupBy }, _user) => {
      const requested = String(groupBy || 'department');
      const key = requested === 'department' ? 'department' : 'department';
      const rows = await employeeRows();
      const counts = new Map();
      for (const e of rows) counts.set(e.department ?? '—', (counts.get(e.department ?? '—') || 0) + 1);
      return {
        groupBy: key,
        requestedGroupBy: requested,
        // True when the caller asked for something live data cannot group by.
        downgraded: requested !== 'department',
        total: rows.length,
        groups: [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      };
    }),

    /**
     * Find an employee.
     *
     * Matches on EMAIL, because no name field has been observed on an employee record. That is a
     * real reduction in capability against the seed version, not a shortcut — and it is why the
     * result carries the email in `name`: printing a blank where a person's name belongs would be
     * worse than printing the address we actually have.
     */
    'zohoPeople.employeeLookup': from('zohoPeople.employeeLookup', async ({ name }, user) => {
      // Yourself and your direct reports, or everyone for an HR admin. Decided before the fetch.
      const reach = teamOf(user, { includeSelf: true });
      const q = String(name).toLowerCase();
      const rows = await employeeRows();
      const hits = rows
        .filter((e) => isWithin(reach, e.recordId))
        .filter((e) => String(e.email ?? '').toLowerCase().includes(q))
        .slice(0, 5)
        // The email stands in for the name until a name field is confirmed. designation and
        // location come out null: no such field is mapped, and PERSON_FIELDS fixes the shape.
        .map((e) => pick({ ...e, employeeId: e.recordId, name: e.email }, PERSON_FIELDS));
      return { query: name, count: hits.length, employees: hits, matchedOn: 'email' };
    }),
  };
}
