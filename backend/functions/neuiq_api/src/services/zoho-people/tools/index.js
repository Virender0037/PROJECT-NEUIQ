/**
 * The tool registry — the allow-list the orchestrator may call.
 *
 * Every tool declares four things, and the shape is what makes the guardrails enforceable rather
 * than aspirational:
 *
 *   params   a schema the orchestrator's arguments are validated against. Not advisory: a call
 *            with an unknown or wrong-typed parameter is refused before it runs.
 *   scope    who may call it at all — 'self' | 'team' | 'admin'. Checked against the caller's
 *            role by the registry, never by the tool body and never by the model.
 *   run      the fetch. Returns NORMALIZED, FIELD-WHITELISTED data.
 *   say      turns the result into a sentence. Deterministic, so the number in the answer is
 *            always the number the tool returned.
 *
 * That last one is the important one. The model chooses a tool and its parameters; it does not
 * write the figures. `say()` is why a wrong answer here is a code bug rather than a hallucination.
 */
import { dataset, isAdmin } from '../../../dashboards/query.service.js';
import { onLeaveToday, NOW } from '../seed.js';

/** Field whitelists. A raw employee record carries PII no prompt needs. */
const publicEmployee = (e) => ({
  employeeId: e.employeeId,
  name: `${e.firstName} ${e.lastName}`,
  department: e.department,
  designation: e.designation,
  location: e.location,
});

const ENTITLEMENT = { Casual: 12, Sick: 8, Earned: 15, Unpaid: 0 };

/** Resolve which employee a request is about, and refuse if the caller may not ask. */
function resolveSubject(user, employeeId) {
  if (!employeeId || employeeId === 'me' || employeeId === user.employeeId) return user.employeeId;

  if (isAdmin(user)) return employeeId;

  // A manager may ask about their own reports and nobody else's. This is the check that stops
  // "show me Priya's leave balance" working for someone who is not her manager.
  const subject = dataset.employees.find((e) => e.employeeId === employeeId);
  if (subject && subject.managerId === user.employeeId) return employeeId;

  const err = new Error('You can only see your own records, or your direct reports.');
  err.status = 403;
  throw err;
}

export const TOOLS = {
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
          .filter((l) => l.employeeId === id && l.leaveType === type && l.status === 'Approved' && l.month.startsWith(year))
          .reduce((s, l) => s + l.days, 0);
        const entitled = ENTITLEMENT[type] ?? 0;
        return { leaveType: type, entitled, taken: Math.round(taken * 10) / 10, remaining: Math.round((entitled - taken) * 10) / 10 };
      });
      return { employeeId: id, year, balances };
    },
    say: (d) => {
      const lines = d.balances.map((b) => `${b.leaveType}: ${b.remaining} of ${b.entitled} days left (${b.taken} taken)`);
      return `Leave balance for ${d.year}:\n- ${lines.join('\n- ')}`;
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
      if (status) rows = rows.filter((l) => l.status.toLowerCase() === String(status).toLowerCase());
      rows = rows.sort((a, b) => b.from.localeCompare(a.from)).slice(0, Math.min(Number(limit) || 10, 50));
      return { employeeId: id, count: rows.length, records: rows.map((l) => ({ leaveType: l.leaveType, status: l.status, days: l.days, from: l.from })) };
    },
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
    say: (d) => (d.found
      ? `Attendance for ${d.month}: ${d.avgHours} hours a day on average, ${d.lateMinutes} late minutes, marked ${d.status}.`
      : `No attendance recorded for ${d.month}.`),
  },

  'zohoPeople.teamOnLeave': {
    label: 'Who is on leave',
    sub: 'Who is out, today or on a date',
    scope: 'team',
    params: {},
    run: (_args, _user) => ({ date: NOW.toISOString().slice(0, 10), people: onLeaveToday(dataset) }),
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
    say: (d) => `${d.total} employees by ${d.groupBy}:\n- ` + d.groups.map((g) => `${g.name}: ${g.value}`).join('\n- '),
  },

  'zohoPeople.employeeLookup': {
    label: 'Find an employee',
    sub: 'Look someone up by name',
    scope: 'team',
    params: { name: 'string' },
    run: ({ name }, _user) => {
      const q = String(name).toLowerCase();
      const hits = dataset.employees
        .filter((e) => `${e.firstName} ${e.lastName}`.toLowerCase().includes(q))
        .slice(0, 5)
        .map(publicEmployee);
      return { query: name, count: hits.length, employees: hits };
    },
    say: (d) => (d.count
      ? `${d.count} match${d.count === 1 ? '' : 'es'} for "${d.query}":\n- ` +
        d.employees.map((e) => `${e.name} · ${e.designation}, ${e.department} · ${e.location}`).join('\n- ')
      : `Nobody matching "${d.query}".`),
  },
};

/** Who may call what. 'team' covers managers and admins; 'admin' is admins only. */
const ROLE_RANK = { employee: 0, manager: 1, hr_admin: 2 };
const SCOPE_MIN = { self: 0, team: 1, admin: 2 };

export function mayCall(toolName, user) {
  const tool = TOOLS[toolName];
  if (!tool) return false;
  return (ROLE_RANK[user?.role] ?? -1) >= SCOPE_MIN[tool.scope];
}

/**
 * Validate arguments against the tool's schema.
 *
 * Deliberately tiny — six tools do not need a schema library. What matters is that it REFUSES:
 * an unknown key or a wrong type throws rather than being quietly dropped, because a silently
 * ignored parameter means the answer is about something other than what was asked.
 */
export function validateArgs(toolName, args = {}) {
  const schema = TOOLS[toolName].params;
  const out = {};
  for (const [key, value] of Object.entries(args)) {
    if (!(key in schema)) {
      const e = new Error(`Unknown parameter "${key}" for ${toolName}`);
      e.status = 400;
      throw e;
    }
    if (value === undefined || value === null || value === '') continue;
    const type = schema[key].replace('?', '');
    if (type === 'number' && Number.isNaN(Number(value))) {
      const e = new Error(`"${key}" must be a number`);
      e.status = 400;
      throw e;
    }
    out[key] = type === 'number' ? Number(value) : String(value);
  }
  for (const [key, type] of Object.entries(schema)) {
    if (!type.endsWith('?') && out[key] === undefined) {
      const e = new Error(`"${key}" is required for ${toolName}`);
      e.status = 400;
      throw e;
    }
  }
  return out;
}

/** The catalogue the AI tab renders. Descriptions only — never the tool bodies. */
export const catalogue = (user) =>
  Object.entries(TOOLS).map(([tool, t]) => ({
    tool, label: t.label, sub: t.sub, scope: t.scope,
    params: Object.keys(t.params),
    allowed: mayCall(tool, user),
  }));
