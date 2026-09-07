/**
 * The Hybrid dock's navigation model — one source of truth for the dock.
 * `view` keys are the same ones every screen already uses with app.go().
 */
export const navSections = () => [
  { title: '', links: [
    { view: 'chat', label: 'Chat', icon: 'message' },
    { view: 'dashboard', label: 'Overview', icon: 'layoutGrid' },
    { view: 'reports', label: 'Analytics', icon: 'activity' },
    { view: 'ai', label: 'AI', icon: 'sparkles' },
  ] },
  { title: 'Workspace', links: [
    { view: 'projects', label: 'Projects', icon: 'folder' },
    { view: 'tasks', label: 'Tasks', icon: 'checkCircle' },
    { view: 'history', label: 'History', icon: 'clock' },
  ] },
  { title: 'Account', links: [
    { view: 'settings', label: 'Settings', icon: 'settings' },
  ] },
];

export const VIEW_TITLE = {
  chat: 'Chat', incognito: 'Private chat', dashboard: 'Overview',
  reports: 'Analytics', builder: 'Analytics', custom: 'Analytics',
  ai: 'AI', projects: 'Projects', project: 'Project workspace',
  tasks: 'Tasks', history: 'History', settings: 'Settings',
};

/* Theme and accent option sets are NOT here - they are shared across every UI style and live
   in shared/lib/theme.js, so a theme added there appears in all of them at once. */
