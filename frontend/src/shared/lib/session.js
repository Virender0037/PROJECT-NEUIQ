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
import { profileFor, roleLabel } from './profile.js';
import { dataSourceInfo } from './dataSource.js';

// roleLabel moved to ./profile.js so the profile and these rows label roles identically.
export { roleLabel };

/**
 * The rows for the Account section.
 *
 * `user` is the server's description of the caller, so `Data access` states what the backend
 * will actually enforce — not what the client believes. When the two could differ, the one worth
 * printing is the one that decides whether a query returns rows.
 */
export function sessionRows({ user, offline, dataSource }) {
  const signedIn = Boolean(user);
  const me = profileFor(user);
  // From what the backend REPORTED (dataSource), never from reachability alone: a backend that
  // answers can still be serving generated demo records.
  const source = dataSourceInfo({ dataSource, offline });
  return [
    {
      key: 'account',
      label: 'Signed in as',
      value: signedIn ? me.name : 'Not signed in',
      hint: signedIn && me.username ? `@${me.username}` : null,
    },
    {
      key: 'role',
      label: 'Role',
      value: signedIn ? me.role : '—',
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
      value: source.settings.value,
      hint: source.settings.hint,
      warn: source.settings.warn,
    },
  ];
}
