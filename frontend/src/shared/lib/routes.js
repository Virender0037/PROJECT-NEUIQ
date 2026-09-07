/**
 * The route table — shared by every UI style.
 *
 * Screens still address each other by a short `view` key (app.go('dashboard')), which is what
 * every existing component calls. This maps that key to a URL so those calls keep working while
 * the address bar becomes real: deep links, back/forward and refresh-in-place all work, and a
 * dashboard nobody can link to is a dashboard nobody shares.
 *
 * Reports, Chart Builder and AI Dashboards stay three ROUTES under /analytics but share one
 * tabbed shell: they are three ways of looking at the same numbers, and three dock rows for
 * that is three decisions before you have looked at anything.
 *
 * `empty` and `chat` deliberately share /chat — they were never two destinations, only "this
 * conversation has no messages yet". The shell decides which to draw from messages.length.
 */
export const VIEW_PATH = {
  empty: '/chat',
  chat: '/chat',
  incognito: '/incognito',
  dashboard: '/dashboard',
  analytics: '/analytics',
  reports: '/analytics/reports',
  builder: '/analytics/chart-builder',
  custom: '/analytics/dashboards',
  ai: '/ai',
  projects: '/projects',
  project: '/projects/workspace',
  history: '/history',
  tasks: '/tasks',
  settings: '/settings',
};

/** Reverse map. Listed explicitly because /chat has two view keys and only `chat` is canonical. */
const PATH_VIEW = {
  '/chat': 'chat',
  '/incognito': 'incognito',
  '/dashboard': 'dashboard',
  '/analytics': 'reports',
  '/analytics/reports': 'reports',
  '/analytics/chart-builder': 'builder',
  '/analytics/dashboards': 'custom',
  '/ai': 'ai',
  '/projects': 'projects',
  '/projects/workspace': 'project',
  '/history': 'history',
  '/tasks': 'tasks',
  '/settings': 'settings',
};

export const HOME = '/chat';

/** URL -> view key, or null when the path matches no screen (the caller decides: 404 or home). */
export function pathToView(pathname) {
  const p = (pathname || '/').replace(/\/+$/, '') || '/';
  return PATH_VIEW[p] || null;
}

export const pathFor = (view) => VIEW_PATH[view] || HOME;
