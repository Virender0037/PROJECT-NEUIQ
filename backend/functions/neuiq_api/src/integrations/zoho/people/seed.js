/**
 * Deterministic seed data, shaped like Zoho People.
 *
 * This is the stand-in for the Zoho People API. It exists so the orchestrator, the query engine
 * and the authorization layer can all be built and tested for real before sandbox access lands —
 * every one of those is about *shaping and scoping* records, not about fetching them, so a local
 * source of correctly-shaped records exercises all three.
 *
 * **Deterministic on purpose.** A seeded PRNG rather than Math.random, and a fixed `NOW`, so
 * every run produces byte-identical data. Otherwise assertions about it would pass or fail
 * depending on the draw, and "the numbers changed" would never be traceable to a code change.
 *
 * Field names follow the shapes Zoho People returns (`employeeId`, `leaveType`, `Days`-style
 * measures) so that swapping in the real client is a transformer change, not a rewrite of every
 * consumer. Verify them against the live API when the sandbox exists — see
 * docs/backend/05-zoho-people-integration.md.
 */

/** The clock the seed is built against. Fixed so warranty-style relative figures stay stable. */
export const NOW = new Date('2026-09-04T00:00:00.000Z');

/**
 * mulberry32 — a tiny seeded PRNG. Any deterministic generator would do; this one is four lines
 * and has good enough distribution for demo data.
 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

export const DEPARTMENTS = ['Engineering', 'Sales', 'Support', 'Finance', 'People'];
export const LOCATIONS = ['Pune', 'Bengaluru', 'Remote'];
export const DESIGNATIONS = ['Engineer', 'Senior Engineer', 'Lead', 'Manager', 'Analyst', 'Executive'];
export const EMPLOYMENT_TYPES = ['Permanent', 'Contract', 'Intern'];
export const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid'];
export const LEAVE_STATUSES = ['Approved', 'Pending', 'Rejected'];
export const ATTENDANCE_STATUSES = ['Present', 'Remote', 'On leave', 'Absent'];

/**
 * The named accounts, so a demo can sign in as a specific person and see the scoping work.
 *
 * `role` is what the authorization layer reads. It is deliberately NOT a Zoho concept — Zoho
 * knows about employees and reporting lines; who may call this API as an admin is our decision,
 * and conflating the two is how an HR-admin flag ends up inferred from a job title.
 */
const NAMED = [
  { employeeId: 'E1001', firstName: 'Alex', lastName: 'Mathew', username: 'alex', role: 'employee', department: 'Engineering', designation: 'Senior Engineer', location: 'Pune', managerId: 'E1003' },
  { employeeId: 'E1002', firstName: 'Priya', lastName: 'Nair', username: 'priya', role: 'employee', department: 'Engineering', designation: 'Engineer', location: 'Pune', managerId: 'E1003' },
  { employeeId: 'E1003', firstName: 'Rohit', lastName: 'Sharma', username: 'rohit', role: 'manager', department: 'Engineering', designation: 'Lead', location: 'Pune', managerId: 'E1005' },
  { employeeId: 'E1004', firstName: 'Meera', lastName: 'Iyer', username: 'meera', role: 'hr_admin', department: 'People', designation: 'Manager', location: 'Bengaluru', managerId: null },
  { employeeId: 'E1005', firstName: 'Arjun', lastName: 'Rao', username: 'arjun', role: 'manager', department: 'Sales', designation: 'Manager', location: 'Bengaluru', managerId: null },
];

const FIRST = ['Ananya', 'Vikram', 'Neha', 'Karan', 'Divya', 'Sanjay', 'Pooja', 'Aditya', 'Sneha', 'Rahul', 'Kavya', 'Nikhil'];
const LAST = ['Deshpande', 'Kulkarni', 'Menon', 'Bose', 'Reddy', 'Gupta', 'Joshi', 'Pillai', 'Verma', 'Chandra'];

/**
 * Build the whole dataset.
 *
 * Leave and attendance are derived FROM the employee list rather than generated independently,
 * which is what keeps them coherent: every leave row points at an employee that exists, and the
 * per-department totals actually add up to the headcount.
 */
export function buildSeed() {
  const r = rng(20260904);

  // ---- employees ----
  const employees = NAMED.map((n) => ({
    ...n,
    employmentType: 'Permanent',
    tenureMonths: int(r, 6, 96),
    email: `${n.username}@fristinetech.com`,
  }));

  for (let i = 0; i < 45; i++) {
    const id = `E${1006 + i}`;
    const first = pick(r, FIRST);
    const last = pick(r, LAST);
    const department = pick(r, DEPARTMENTS);
    employees.push({
      employeeId: id,
      firstName: first,
      lastName: last,
      username: `${first}.${last}`.toLowerCase(),
      email: `${first}.${last}`.toLowerCase() + '@fristinetech.com',
      role: 'employee',
      department,
      designation: pick(r, DESIGNATIONS),
      location: pick(r, LOCATIONS),
      employmentType: pick(r, EMPLOYMENT_TYPES),
      tenureMonths: int(r, 1, 120),
      // Everyone rolls up to one of the two managers, so "my team" is never empty.
      managerId: department === 'Sales' ? 'E1005' : 'E1003',
    });
  }

  // ---- leave records ----
  // Six months back from NOW, so `month` groupings have something to plot along.
  const leave = [];
  let leaveSeq = 1;
  for (const e of employees) {
    const count = int(r, 2, 9);
    for (let i = 0; i < count; i++) {
      const monthsAgo = int(r, 0, 5);
      const d = new Date(NOW);
      d.setUTCMonth(d.getUTCMonth() - monthsAgo);
      d.setUTCDate(int(r, 1, 27));
      leave.push({
        recordId: `L${leaveSeq++}`,
        employeeId: e.employeeId,
        departmentId: e.department,
        leaveType: pick(r, LEAVE_TYPES),
        // Weighted towards Approved: a queue that is 1/3 rejected is not a realistic org.
        status: r() < 0.78 ? 'Approved' : pick(r, ['Pending', 'Rejected']),
        days: pick(r, [0.5, 1, 1, 1, 2, 3, 5]),
        from: d.toISOString().slice(0, 10),
        month: d.toISOString().slice(0, 7),
      });
    }
  }

  // ---- attendance ----
  // One row per employee per month rather than per day: every screen that reads it aggregates
  // by month anyway, and 48 x 180 daily rows would be 8,600 records to scan on every query.
  const attendance = [];
  let attSeq = 1;
  for (const e of employees) {
    for (let m = 5; m >= 0; m--) {
      const d = new Date(NOW);
      d.setUTCMonth(d.getUTCMonth() - m);
      attendance.push({
        recordId: `A${attSeq++}`,
        employeeId: e.employeeId,
        departmentId: e.department,
        status: r() < 0.72 ? 'Present' : pick(r, ATTENDANCE_STATUSES),
        hours: Math.round((7.4 + r() * 1.8) * 10) / 10,
        lateMinutes: r() < 0.7 ? 0 : int(r, 3, 45),
        month: d.toISOString().slice(0, 7),
      });
    }
  }

  return { employees, leave, attendance };
}

/** Who is out today. Derived rather than stored, so it can never disagree with the leave rows. */
export function onLeaveToday(seed) {
  const today = NOW.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  return seed.leave
    .filter((l) => l.status === 'Approved' && l.month === month)
    .slice(0, 6)
    .map((l) => {
      const e = seed.employees.find((x) => x.employeeId === l.employeeId);
      return {
        employeeId: l.employeeId,
        name: e ? `${e.firstName} ${e.lastName}` : l.employeeId,
        leaveType: l.leaveType,
        days: l.days,
      };
    });
}
