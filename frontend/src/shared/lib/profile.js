/**
 * Who is signed in, as every UI style shows it — from the server's `user`, never from a default.
 *
 * The Classic sidebar used to print "Alex Morgan · Pro plan" for every account, and the greeting
 * fell back to "Alex": an HR admin signed in as Meera saw someone else's name, and the seed even
 * has an "Alex Mathew", so the wrong name looked like a real employee. Identity now comes only
 * from the authenticated user (/me or /auth/login). A missing field shows a neutral fallback —
 * "User" — never an invented person.
 *
 * Imports nothing, so it can be asserted under plain `node`.
 */

/** Role ids are stored snake_case; nobody wants to read `hr_admin` in a UI. */
export const roleLabel = (role) => ({
  employee: 'Employee',
  manager: 'Manager',
  hr_admin: 'HR admin',
}[role] || role || 'Unknown');

export const FALLBACK_NAME = 'User';
export const FALLBACK_ROLE = 'Role unavailable';

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * Up to two initials from a real name. Letters only — a stray digit or symbol is not an initial —
 * and an empty string when there is no name, so the avatar shows a neutral icon rather than
 * someone else's letters.
 */
export function initialsOf(name) {
  const words = clean(name).split(' ').filter((w) => /\p{L}/u.test(w));
  if (!words.length) return '';
  const first = words[0].match(/\p{L}/u)[0];
  const last = words.length > 1 ? words[words.length - 1].match(/\p{L}/u)[0] : '';
  return (first + last).toUpperCase();
}

/**
 * The profile to display for `user` (or for nobody).
 *
 *   name       the user's name, or "User"
 *   firstName  the first word of a REAL name, or null — the greeting uses it, and says nothing
 *              rather than inventing one
 *   initials   from the real name, or "" (the avatar then shows a neutral mark)
 *   role       the authorised role, labelled, or "Role unavailable"
 *   username   for an @handle hint, or null
 */
export function profileFor(user) {
  const name = clean(user?.name);
  const role = clean(user?.role);
  return {
    name: name || FALLBACK_NAME,
    firstName: name ? name.split(' ')[0] : null,
    initials: initialsOf(name),
    role: role ? roleLabel(role) : FALLBACK_ROLE,
    username: clean(user?.username) || null,
    known: Boolean(name),
  };
}
