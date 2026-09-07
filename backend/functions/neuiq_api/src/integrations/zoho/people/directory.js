/**
 * The employee directory — People's answer to "who is this caller, and who reports to whom".
 *
 * This exists to close the last inverted dependency. `app.js` and `middleware/index.js` both
 * reached into `dataset.employees` directly, which meant the route layer and the auth layer both
 * knew Zoho People's record shape. They now ask this interface instead, and a second product can
 * supply its own without either of them changing.
 *
 * `resolve` is the identity resolver core/auth/principal.js expects. It is where the chain
 *
 *     NEUIQ session -> Zoho identity -> People employee -> authorization scope
 *
 * will be built out in Phase 4. Today it is the demo lookup, moved unchanged.
 */
import { dataset } from './dataset.js';

/** The seeded accounts offered on the sign-in screen, so a demo can show the scoping work. */
const DEMO_USERNAMES = ['alex', 'priya', 'rohit', 'meera', 'arjun'];

export const directory = {
  /** How many employees the org has. Used by /health and the admin headcount tile. */
  count: () => dataset.employees.length,

  byId: (employeeId) => dataset.employees.find((e) => e.employeeId === employeeId) || null,

  byUsername: (username) => dataset.employees.find((e) => e.username === username) || null,

  /** The demo account picker. Fields chosen deliberately — no email, no tenure, no manager line. */
  demoAccounts: () => dataset.employees
    .filter((e) => DEMO_USERNAMES.includes(e.username))
    .map((e) => ({
      username: e.username,
      name: `${e.firstName} ${e.lastName}`,
      role: e.role,
      department: e.department,
    })),

  /**
   * Token payload -> the caller, as the server sees them.
   *
   * Looked up fresh rather than trusted from the token, so a role change takes effect immediately
   * and a token cannot assert a role its employee does not have. Returns null when the account is
   * gone, which the middleware turns into a 401.
   */
  resolve: (payload) => {
    const e = dataset.employees.find((x) => x.employeeId === payload.employeeId);
    if (!e) return null;
    return {
      employeeId: e.employeeId,
      username: e.username,
      name: `${e.firstName} ${e.lastName}`,
      role: e.role,
      department: e.department,
    };
  },
};
