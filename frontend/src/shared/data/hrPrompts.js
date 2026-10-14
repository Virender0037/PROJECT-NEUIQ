/**
 * Example prompts for the empty chat screen — HR questions NeuIQ can actually answer.
 *
 * These replaced generic assistant prompts ("Write a React hook", "launch my product in 90 days")
 * that NeuIQ cannot answer: it is an HR assistant with six read-only tools, and suggesting
 * anything else promises a capability that does not exist.
 *
 * ## Only what the signed-in role can use
 *
 * Each prompt names the tool it routes to and that tool's scope. `promptsFor(user)` keeps only
 * the ones the caller's role clears, using the same rank table as the backend
 * (core/policy/roles.js), so an employee is never offered "Who is on leave today?" only to be
 * refused. The server still decides — this is a courtesy, never a permission check.
 *
 * A frontend test asserts each prompt really routes to its tool through the backend's keyword
 * router, and that the rank table matches the backend's, so the two cannot drift silently.
 *
 * These are example questions, not conversations: nothing here is an answer.
 *
 * Imports nothing, so it can be asserted under plain `node`.
 */

/** Mirrors ROLE_RANK / SCOPE_MIN in backend/.../core/policy/roles.js. Asserted equal by test. */
export const ROLE_RANK = Object.freeze({ employee: 0, manager: 1, hr_admin: 2 });
export const SCOPE_MIN = Object.freeze({ self: 0, team: 1, admin: 2 });

/**
 * Display order is the array order. `priority` decides which survive when a role has more than
 * the four the layout holds: lower is kept first, so an HR admin's one admin-only prompt is never
 * the one trimmed away.
 */
export const HR_PROMPTS = Object.freeze([
  { icon: 'file', title: 'My leave records', sub: 'Applications and their status',
    prompt: 'Show my leave records', tool: 'zohoPeople.leaveRecords', scope: 'self', priority: 1 },
  { icon: 'checkCircle', title: 'My leave balance', sub: 'What Zoho People reports for you',
    prompt: 'How much leave do I have left?', tool: 'zohoPeople.leaveBalance', scope: 'self', priority: 4 },
  { icon: 'clock', title: 'My attendance', sub: 'Hours and late marks this month',
    prompt: 'Show my attendance summary', tool: 'zohoPeople.attendanceSummary', scope: 'self', priority: 5 },
  { icon: 'user', title: 'Who is out', sub: 'Your team, on leave today',
    prompt: 'Who is on leave today?', tool: 'zohoPeople.teamOnLeave', scope: 'team', priority: 2 },
  { icon: 'layoutGrid', title: 'Headcount', sub: 'Employees by department',
    prompt: 'Show headcount by department', tool: 'zohoPeople.headcount', scope: 'admin', priority: 3 },
].map((p) => Object.freeze(p)));

export const MAX_PROMPTS = 4;

/**
 * The prompts this caller's role can use, at most four, in display order.
 *
 * An unknown or missing role gets self-scope prompts only — the least anyone signed in can do —
 * rather than everything.
 */
export function promptsFor(user) {
  const rank = Object.hasOwn(ROLE_RANK, user?.role ?? '') ? ROLE_RANK[user.role] : 0;
  const allowed = HR_PROMPTS.filter((p) => SCOPE_MIN[p.scope] <= rank);
  const keep = new Set([...allowed].sort((a, b) => a.priority - b.priority).slice(0, MAX_PROMPTS));
  return allowed.filter((p) => keep.has(p));
}
