/**
 * Honest empty states — the copy every screen without a real data source shows instead of mock
 * figures.
 *
 * ## Why this file exists
 *
 * Overview, History, Tasks, Projects and the AI activity feed used to render invented content
 * (1,284 chats, a canned 90-day-roadmap conversation, "Answered 'who is on leave today' 2 days
 * ago") with nothing on screen saying so. In an HR product an invented figure next to a real one
 * contaminates both, so those screens now say what is actually true: the feature has no data
 * source yet.
 *
 * ## Four different answers, never confused
 *
 *   NO_RECORDS     the source answered, and there is nothing   ("No saved conversations yet")
 *   NOT_CONNECTED  there is no source for this feature yet     ("Task management is not connected yet")
 *   UNAVAILABLE    the source exists but could not be reached  (never shown as "no records")
 *   FORBIDDEN      the source refused this account             (a 403 is an answer, not an empty list)
 *
 * Every screen in this file is NOT_CONNECTED today — none has a backend. The other kinds are
 * defined here so a screen that gains an API reuses the same vocabulary rather than inventing one.
 * API-backed widgets already distinguish UNAVAILABLE and FORBIDDEN (Widget.jsx in each style).
 *
 * The copy is shared, the chrome is not: each UI style renders it with its own EmptyPanel, so
 * Classic and Hybrid say exactly the same thing in their own look. No counts, dates or names
 * appear here — an empty state that contains a number is not empty.
 *
 * Imports nothing, so it can be asserted under plain `node`.
 */

export const STATE_KIND = Object.freeze({
  NO_RECORDS: 'no-records',
  NOT_CONNECTED: 'not-connected',
  UNAVAILABLE: 'unavailable',
  FORBIDDEN: 'forbidden',
});

/** The short badge each kind wears, so the kind is visible, not only implied by the wording. */
export const KIND_LABEL = Object.freeze({
  [STATE_KIND.NO_RECORDS]: 'No records',
  [STATE_KIND.NOT_CONNECTED]: 'Not connected',
  [STATE_KIND.UNAVAILABLE]: 'Unavailable',
  [STATE_KIND.FORBIDDEN]: 'Not permitted',
});

const notConnected = (icon, title, body) => Object.freeze({ kind: STATE_KIND.NOT_CONNECTED, icon, title, body });

export const EMPTY = Object.freeze({
  overview: notConnected('activity', 'No usage data available yet',
    'Usage tracking is not connected, so chat, message and activity figures are not shown. Nothing on this page is estimated.'),
  history: notConnected('clock', 'No saved conversations yet',
    'Conversation history is not stored yet. A chat lasts only while this page is open.'),
  sidebarHistory: notConnected('clock', 'No saved chats yet',
    'History is not stored yet.'),
  sidebarProjects: notConnected('folder', 'No projects',
    'Projects are not connected yet.'),
  tasks: notConnected('checkCircle', 'Task management is not connected yet',
    'No tasks are shown because NeuIQ has no task source. Nothing here is a sample.'),
  projects: notConnected('folder', 'No projects available',
    'Project workspaces are not connected yet, so there are no projects, chats or files to show.'),
  projectWorkspace: notConnected('folder', 'Project workspace is not connected yet',
    'There are no project chats or files to show.'),
  aiActivity: notConnected('clock', 'No recent activity available',
    'NeuIQ does not keep an activity log yet. Questions you ask are not recorded here.'),
});

/** What an unsupported action says instead of claiming it worked. */
export const COMING_SOON = 'Coming soon';

/**
 * What the app says when the API cannot be reached (Phase 4).
 *
 * These replaced automatic sample data: an unreachable backend used to produce invented charts,
 * KPI figures, a canned assistant reply, demo dashboards and even a signed-in local user. Each
 * failure now says what it is — nothing was loaded, sent, saved or verified — and nothing stands
 * in for the data that could not be fetched.
 */
export const CONNECTION = Object.freeze({
  title: 'API unavailable',
  load: 'Cannot connect to the server, so nothing can be loaded. Nothing shown here is a substitute.',
  chatNotSent: 'Not sent — cannot connect to the server. Your question was not answered.',
  signIn: 'Sign-in unavailable — cannot connect to server',
  notSaved: 'Not saved — cannot connect to the server. Your change was not stored.',
  buildFailed: 'Cannot build a dashboard — cannot connect to the server.',
});

/**
 * Classify a failed request into one of the four kinds, with its wording.
 *
 *   403             FORBIDDEN    a real answer about this account — never shown as "no records"
 *   offline / 5xx   UNAVAILABLE  the data exists somewhere but could not be fetched
 *   other 4xx       UNAVAILABLE  with the server's own message (the request itself was refused)
 *
 * `err.offline` is set by the API client when the request never reached the server.
 */
export function errorState(err) {
  if (err?.status === 403) {
    return { kind: STATE_KIND.FORBIDDEN, icon: 'lock', title: 'Not available on your account.', body: err?.message || '' };
  }
  if (err?.offline) return { kind: STATE_KIND.UNAVAILABLE, icon: 'help', title: CONNECTION.title, body: CONNECTION.load };
  if (!err?.status || err.status >= 500) {
    return { kind: STATE_KIND.UNAVAILABLE, icon: 'help', title: 'Could not load this right now.', body: 'The server could not answer. Try again shortly.' };
  }
  return { kind: STATE_KIND.UNAVAILABLE, icon: 'help', title: 'Could not load this.', body: err?.message || '' };
}

/**
 * The message for a failed action (save, rename, delete, build). Offline gets the explicit
 * "not saved" wording so a change held nowhere is never mistaken for one that was stored.
 */
export function actionFailedMessage(err, offlineMessage = CONNECTION.notSaved) {
  if (err?.offline) return offlineMessage;
  if (err?.status === 403) return 'Not available on your account.';
  return err?.message || 'That did not work.';
}
