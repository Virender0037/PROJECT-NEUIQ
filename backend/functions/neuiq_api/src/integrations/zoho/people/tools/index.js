/**
 * The Zoho People tools.
 *
 * Moved from services/zoho-people/tools/index.js. The six tools are unchanged — same names, same
 * params, same scopes, same bodies, same sentences. What left this file is everything that was
 * never about People: the registry, the rank check, argument validation and the catalogue are now
 * in core/tools/, and `resolveSubject` is in core/policy/authorize.js because deciding who may
 * ask about whom is a policy question, not a People one.
 *
 * Each tool still declares the same four things, and the shape is what makes the guardrails
 * enforceable rather than aspirational:
 *
 *   params   validated by core/tools/validate.js — refuses unknown keys, never drops them
 *   scope    'self' | 'team' | 'admin', checked by core/tools/registry.js before `run`
 *   run      the fetch. Returns NORMALIZED, FIELD-WHITELISTED data.
 *   say      turns the result into a sentence. Deterministic, so the number in the answer is
 *            always the number the tool returned.
 *
 * That last one is why a wrong answer here is a code bug rather than a hallucination.
 *
 * **Phase 3 note.** `run(args, user)` keeps its current signature. The move to `run(args, ctx)`
 * with an injected client is what lets these same bodies run against live Zoho, and it lands with
 * the client — changing the signature now would be churn with nothing to point it at.
 */
import { dataset } from '../dataset.js';
import { onLeaveToday, NOW } from '../seed.js';
import { isApprovedLeave, matchesLeaveStatus } from '../leaveStatus.js';
import {
  resolveSubject, teamOf, isWithin,
} from '../../../../core/policy/authorize.js';

/**
 * Field allow-lists, shared with the live tools so both return exactly the same shape.
 *
 * A raw employee record carries PII no prompt and no chat response needs — the live employee form
 * holds national ID numbers, home addresses and dates of birth. What a tool returns is built from
 * these lists, never by passing a record through, so a field nobody listed cannot leave.
 */
export const PERSON_FIELDS = Object.freeze(['employeeId', 'name', 'department', 'designation', 'location']);
export const ON_LEAVE_FIELDS = Object.freeze(['employeeId', 'name', 'leaveType', 'days']);
export const LEAVE_RECORD_FIELDS = Object.freeze(['leaveType', 'status', 'days', 'from']);

/** Exactly `fields`, in order. Missing values are null rather than absent, so shapes never vary. */
export const pick = (obj, fields) => Object.fromEntries(fields.map((f) => [f, obj?.[f] ?? null]));

const publicEmployee = (e) => pick({ ...e, name: `${e.firstName} ${e.lastName}` }, PERSON_FIELDS);

/** The rows of a single-subject result: the result itself, which carries `employeeId`. */
const self = (d) => [d];

/** Demo entitlements for the seed. Invented — the seed has no leave policy to read. */
const ENTITLEMENT = { Casual: 12, Sick: 8, Earned: 15, Unpaid: 0 };

export const PEOPLE_TOOLS = {
  'zohoPeople.leaveBalance': {
    label: 'Leave balance',
    sub: 'Remaining days by leave type',
    scope: 'self',
    params: { employeeId: 'string?', leaveType: 'string?' },
    run: ({ employeeId, leaveType }, user) => {
      const id = resolveSubject(user, employeeId);
      const year = String(NOW.getUTCFullYear());
      const types = leaveType ? [leaveType] : Object.keys(ENTITLEMENT);
      const balances = types.map((type) => {
        const taken = dataset.leave
          .filter((l) => l.employeeId === id && l.leaveType === type && isApprovedLeave(l) && l.month.startsWith(year))
          .reduce((s, l) => s + l.days, 0);
        const entitled = ENTITLEMENT[type] ?? 0;
        return { leaveType: type, entitled, taken: Math.round(taken * 10) / 10, remaining: Math.round((entitled - taken) * 10) / 10 };
      });
      // Labelled as demo data in the result itself, not only in the sentence.
      return { employeeId: id, dataSource: 'seed', demo: true, year, balances };
    },
    subjectRows: self,
    /**
     * Two shapes, one sentence-writer — the seed and live tools share `say` by contract.
     *
     * Live (`dataSource: 'zoho'`) reports Zoho's balance and booked figures for a stated period,
     * and says what is unconfirmed. It never says "entitled" or "of N": Zoho does not report an
     * entitlement, and implying one would be inventing it. The seed sentence keeps its wording and
     * says it is demo data.
     */
    say: (d) => {
      if (d.dataSource === 'zoho') {
        const p = d.period;
        if (!d.balances.length) {
          return d.requestedLeaveType
            ? `Zoho People has no leave type called "${d.requestedLeaveType}" for this employee.`
            : 'Zoho People reported no leave types for this employee.';
        }
        const unit = (u, n) => (/^day/i.test(u) ? `day${n === 1 ? '' : 's'}` : /^hour/i.test(u) ? `hour${n === 1 ? '' : 's'}` : u);
        const lines = d.balances.map((b) => `${b.leaveType}: ${b.balance} ${unit(b.unit, b.balance)} balance`
          + (b.booked === null ? ', booked not reported' : `, ${b.booked} ${unit(b.unit, b.booked)} booked`));
        return `Zoho People leave report, ${p.from} to ${p.to} (as of ${p.asOf}):\n- ${lines.join('\n- ')}\n`
          + `Note: ${p.unconfirmed}`;
      }
      const lines = d.balances.map((b) => `${b.leaveType}: ${b.remaining} of ${b.entitled} days left (${b.taken} taken)`);
      return `Leave balance for ${d.year} (demo data, not from Zoho People):\n- ${lines.join('\n- ')}`;
    },
  },

  'zohoPeople.leaveRecords': {
    label: 'Leave records',
    sub: 'Applications, status and history',
    scope: 'self',
    params: { employeeId: 'string?', status: 'string?', limit: 'number?' },
    run: ({ employeeId, status, limit }, user) => {
      const id = resolveSubject(user, employeeId);
      let rows = dataset.leave.filter((l) => l.employeeId === id);
      if (status) rows = rows.filter((l) => matchesLeaveStatus(l, status));
      rows = rows.sort((a, b) => b.from.localeCompare(a.from)).slice(0, Math.min(Number(limit) || 10, 50));
      return { employeeId: id, count: rows.length, records: rows.map((l) => pick(l, LEAVE_RECORD_FIELDS)) };
    },
    subjectRows: self,
    say: (d) => (d.count
      ? `${d.count} leave record${d.count === 1 ? '' : 's'}:\n- ` +
        d.records.map((r) => `${r.from} · ${r.leaveType} · ${r.days} day${r.days === 1 ? '' : 's'} · ${r.status}`).join('\n- ')
      : 'No leave records found.'),
  },

  'zohoPeople.attendanceSummary': {
    label: 'Attendance',
    sub: 'Hours, late marks and absences',
    scope: 'self',
    params: { employeeId: 'string?', month: 'string?' },
    run: ({ employeeId, month }, user) => {
      const id = resolveSubject(user, employeeId);
      const target = month || NOW.toISOString().slice(0, 7);
      const rows = dataset.attendance.filter((a) => a.employeeId === id && a.month === target);
      if (!rows.length) return { employeeId: id, month: target, found: false };
      const avg = rows.reduce((s, a) => s + a.hours, 0) / rows.length;
      return {
        employeeId: id,
        month: target,
        found: true,
        avgHours: Math.round(avg * 10) / 10,
        lateMinutes: rows.reduce((s, a) => s + a.lateMinutes, 0),
        status: rows[0].status,
      };
    },
    subjectRows: self,
    say: (d) => (d.found
      ? `Attendance for ${d.month}: ${d.avgHours} hours a day on average, ${d.lateMinutes} late minutes, marked ${d.status}.`
      : `No attendance recorded for ${d.month}.`),
  },

  'zohoPeople.teamOnLeave': {
    label: 'Who is on leave',
    sub: 'Who is out, today or on a date',
    scope: 'team',
    params: {},
    /**
     * The caller's direct reports, or everyone for an HR admin. Before this was scoped, any manager
     * saw the whole organisation's absences — the 'team' scope only decided who could CALL the
     * tool, not whose rows it returned.
     */
    run: (_args, user) => {
      const team = teamOf(user);
      const people = onLeaveToday(dataset, { include: (id) => isWithin(team, id) })
        .map((p) => pick(p, ON_LEAVE_FIELDS));
      return { date: NOW.toISOString().slice(0, 10), people };
    },
    subjectRows: (d) => d.people,
    say: (d) => (d.people.length
      ? `${d.people.length} out on ${d.date}:\n- ` + d.people.map((p) => `${p.name} · ${p.leaveType} · ${p.days} day${p.days === 1 ? '' : 's'}`).join('\n- ')
      : `Nobody is on leave on ${d.date}.`),
  },

  'zohoPeople.headcount': {
    label: 'Headcount',
    sub: 'Employees by department or location',
    scope: 'admin',
    params: { groupBy: 'string?' },
    run: ({ groupBy }, _user) => {
      const key = ['department', 'location', 'designation'].includes(groupBy) ? groupBy : 'department';
      const counts = new Map();
      for (const e of dataset.employees) counts.set(e[key], (counts.get(e[key]) || 0) + 1);
      return {
        groupBy: key,
        total: dataset.employees.length,
        groups: [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      };
    },
    // Counts only, and admin-scoped. Nothing in it names an employee.
    subjectRows: () => [],
    say: (d) => `${d.total} employees by ${d.groupBy}:\n- ` + d.groups.map((g) => `${g.name}: ${g.value}`).join('\n- '),
  },

  'zohoPeople.employeeLookup': {
    label: 'Find an employee',
    sub: 'Look someone up by name',
    scope: 'team',
    params: { name: 'string' },
    /**
     * Searches only the people the caller may see: themselves and their direct reports, or
     * everyone for an HR admin. Filtered BEFORE the five-result cap, for the same reason as
     * teamOnLeave.
     */
    run: ({ name }, user) => {
      const q = String(name).toLowerCase();
      const reach = teamOf(user, { includeSelf: true });
      const hits = dataset.employees
        .filter((e) => isWithin(reach, e.employeeId))
        .filter((e) => `${e.firstName} ${e.lastName}`.toLowerCase().includes(q))
        .slice(0, 5)
        .map(publicEmployee);
      return { query: name, count: hits.length, employees: hits };
    },
    subjectRows: (d) => d.employees,
    say: (d) => (d.count
      ? `${d.count} match${d.count === 1 ? '' : 'es'} for "${d.query}":\n- ` +
        d.employees.map((e) => `${e.name} · ${e.designation}, ${e.department} · ${e.location}`).join('\n- ')
      : `Nobody matching "${d.query}".`),
  },
};
