/**
 * What Settings shows about the current session, as plain data.
 *
 * A shared function rather than a shared component because the two UI styles have different
 * token sets and different class names — Classic paints with `--text`/`--surface`, Hybrid with
 * `--ink`/`--panel` — so a single component would have to be style-neutral and would end up
 * matching neither. Sharing the DATA is what keeps them from disagreeing about facts, which is
 * the part that actually matters: two screens showing different roles for the same account is a
 * bug a user cannot resolve.
 */
import { API_URL } from '../api/index.js';

/** Role ids are stored snake_case; nobody wants to read `hr_admin` in a UI. */
export const roleLabel = (role) => ({
  employee: 'Employee',
  manager: 'Manager',
  hr_admin: 'HR admin',
}[role] || role || 'Unknown');

/**
 * The rows for the Account section.
 *
 * `user` is the server's description of the caller, so `Data access` states what the backend
 * will actually enforce — not what the client believes. When the two could differ, the one worth
 * printing is the one that decides whether a query returns rows.
 */
export function sessionRows({ user, offline }) {
  const signedIn = Boolean(user);
  return [
    {
      key: 'account',
      label: 'Signed in as',
      value: signedIn ? user.name : 'Not signed in',
      hint: signedIn && user.username ? `@${user.username}` : null,
    },
    {
      key: 'role',
      label: 'Role',
      value: signedIn ? roleLabel(user.role) : '—',
      hint: signedIn
        ? user.isAdmin
          ? 'Reads across the organisation'
          : 'Reads scoped to your own records'
        : null,
    },
    {
      key: 'api',
      label: 'API',
      // Reachability first, address second: "which server" only matters once you know whether
      // anything is answering on it.
      value: offline ? 'Unreachable' : 'Connected',
      hint: API_URL,
      warn: offline,
    },
    {
      key: 'mode',
      label: 'Data',
      value: offline ? 'Local sample data' : 'Live from the API',
      hint: offline
        ? 'Figures on screen are samples, not Zoho People records.'
        : 'Every figure is re-fetched and re-scoped when you open a screen.',
      warn: offline,
    },
  ];
}
