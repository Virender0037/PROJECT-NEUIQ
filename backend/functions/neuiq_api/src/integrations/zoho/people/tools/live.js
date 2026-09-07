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
import { PEOPLE_TOOLS } from './index.js';
import { transformLeaveRecords } from '../transformers/leave.js';
import { transformEmployeeRecords } from '../transformers/employee.js';
import { AttendanceTransformerPendingError } from '../transformers/attendance.js';
import { defaultWindow } from '../sources.live.js';

/** Entitlements are org policy, not an API field. Same table the seed tools use. */
const ENTITLEMENT = { Casual: 12, Sick: 8, Earned: 15, Unpaid: 0 };

/** Reuse the seed tool's declaration, replace only its body. Keeps the contract identical. */
const from = (name, run) => ({ ...PEOPLE_TOOLS[name], run });

export function buildLiveTools({ client, now = () => new Date() }) {
  /** Leave rows for one employee over the default window, already normalized. */
  async function leaveFor(employeeId, signal) {
    const { from: f, to } = defaultWindow(now());
    const raw = await client.leaves({ from: f, to, user: { employeeId }, signal });
    return transformLeaveRecords(raw).filter((r) => r.employeeId === employeeId);
  }

  return {
    'zohoPeople.leaveBalance': from('zohoPeople.leaveBalance', async ({ employeeId, leaveType }, user) => {
      const id = resolveSubject(user, employeeId);
      const rows = await leaveFor(id);
      const year = String(now().getUTCFullYear());
      const types = leaveType ? [leaveType] : Object.keys(ENTITLEMENT);
      const balances = types.map((type) => {
        const taken = rows
          .filter((l) => l.leaveType === type && l.status === 'Approved' && String(l.month || '').startsWith(year))
          .reduce((s, l) => s + l.days, 0);
        const entitled = ENTITLEMENT[type] ?? 0;
        return { leaveType: type, entitled, taken: Math.round(taken * 10) / 10, remaining: Math.round((entitled - taken) * 10) / 10 };
      });
      return { employeeId: id, year, balances };
    }),

    'zohoPeople.leaveRecords': from('zohoPeople.leaveRecords', async ({ employeeId, status, limit }, user) => {
      const id = resolveSubject(user, employeeId);
      let rows = await leaveFor(id);
      if (status) rows = rows.filter((l) => String(l.status).toLowerCase() === String(status).toLowerCase());
      rows = rows.sort((a, b) => String(b.from).localeCompare(String(a.from))).slice(0, Math.min(Number(limit) || 10, 50));
      return {
        employeeId: id,
        count: rows.length,
        records: rows.map((l) => ({ leaveType: l.leaveType, status: l.status, days: l.days, from: l.from })),
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

    'zohoPeople.teamOnLeave': from('zohoPeople.teamOnLeave', async (_args, user) => {
      const today = now().toISOString().slice(0, 10);
      const { from: f, to } = defaultWindow(now());
      const raw = await client.leaves({ from: f, to, user, signal: undefined });
      const people = transformLeaveRecords(raw)
        .filter((l) => l.status === 'Approved' && l.from <= today && (l.to ?? l.from) >= today)
        .slice(0, 6)
        .map((l) => ({ employeeId: l.employeeId, name: l.employeeName || l.employeeId, leaveType: l.leaveType, days: l.days }));
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
      const rows = transformEmployeeRecords(await client.employees({}));
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
    'zohoPeople.employeeLookup': from('zohoPeople.employeeLookup', async ({ name }, _user) => {
      const q = String(name).toLowerCase();
      const rows = transformEmployeeRecords(await client.employees({}));
      const hits = rows
        .filter((e) => String(e.email ?? '').toLowerCase().includes(q))
        .slice(0, 5)
        .map((e) => ({
          employeeId: e.recordId,
          // The email stands in for the name until a name field is confirmed.
          name: e.email,
          department: e.department,
          designation: null,
          location: null,
        }));
      return { query: name, count: hits.length, employees: hits, matchedOn: 'email' };
    }),
  };
}
