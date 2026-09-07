/**
 * All mock/demo content for NeuIQ, kept in one place so screens stay dumb and
 * data is easy to swap for a real API later. Nothing here holds UI state.
 */

export const SIDE_PROJECTS = [
  'AI Startup Assistant',
  'Marketing System',
  'Research Hub',
  'Personal Assistant',
];

export const PINNED = ['Product Strategy', 'Marketing Plan', 'Research Notes'];

export const HISTORY_GROUPS = [
  { label: 'Today', items: ['Build product roadmap', 'Analyze competitors', 'Create landing page'] },
  { label: 'Yesterday', items: ['Database architecture', 'Write technical documentation'] },
  { label: 'Previous 7 days', items: ['Create marketing strategy', 'Investor update draft', 'Pricing model review'] },
];

export const SUGGESTIONS = [
  { icon: 'file', title: 'Analyze a document', sub: 'Summarize, extract, or ask questions', prompt: 'Analyze this document and pull out the key decisions and open questions.' },
  { icon: 'checkCircle', title: 'Create a plan', sub: 'Turn a goal into clear steps', prompt: 'Create a step-by-step plan to launch my product in 90 days.' },
  { icon: 'zap', title: 'Write code', sub: 'Prototype, debug, or refactor', prompt: 'Write a React hook that debounces a value.' },
  { icon: 'search', title: 'Research a topic', sub: 'Compare options and sources', prompt: 'Research the top approaches to on-device speech-to-text and compare them.' },
];

export const STATS = [
  { label: 'Total chats', value: '1,284', delta: '+12% this week', deltaColor: 'var(--green)', icon: 'message' },
  { label: 'Messages', value: '18.4k', delta: '+8% this week', deltaColor: 'var(--green)', icon: 'activity' },
  { label: 'Projects', value: '9', delta: '2 active', deltaColor: 'var(--text-subtle)', icon: 'folder' },
  { label: 'Tasks done', value: '47', delta: '6 pending', deltaColor: 'var(--amber)', icon: 'checkCircle' },
];

export const USAGE_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const USAGE_VALUES = [62, 48, 80, 55, 95, 34, 40];

export const ACTIVITY = [
  { icon: 'message', text: 'Analyzed 3 competitors in AI Startup', time: '12 min ago' },
  { icon: 'file', text: 'Generated pitch deck outline', time: '1 hour ago' },
  { icon: 'checkCircle', text: 'Completed \u201CReview analytics\u201D', time: '3 hours ago' },
  { icon: 'folder', text: 'Created Research Hub project', time: 'Yesterday' },
];

export const RECENT_WORK = [
  { icon: 'message', title: 'Build product roadmap', meta: 'Updated 12 min ago', open: 'Build product roadmap' },
  { icon: 'file', title: 'Landing page copy', meta: 'Updated 2 hours ago', open: 'Create landing page' },
  { icon: 'folder', title: 'Marketing System', meta: '6 chats \u00B7 today', open: 'project' },
];

export const WIDGETS = [
  { title: 'Usage this month', value: '18.4k', sub: 'messages sent', span: 1 },
  { title: 'Avg. response time', value: '1.2s', sub: 'across all chats', span: 1 },
  { title: 'Active streak', value: '12 days', sub: 'keep it going', span: 1 },
  { title: 'Top project', value: 'AI Startup', sub: '38% of activity', span: 1 },
  { title: 'Saved responses', value: '64', sub: 'in your library', span: 1 },
];

export const GRID_PROJECTS = [
  { name: 'AI Startup Assistant', date: 'Updated today', desc: 'Go-to-market plan, positioning and launch roadmap for the note-taking app.' },
  { name: 'Marketing System', date: 'Jun 15', desc: '' },
  { name: 'Research Hub', date: 'Jun 8', desc: 'Ongoing competitive and user research, interviews and synthesis.' },
  { name: 'Personal Assistant', date: 'Jun 8', desc: '' },
  { name: 'Content Engine', date: 'Jun 2', desc: '' },
  { name: 'Investor Relations', date: 'May 27', desc: 'Updates, data room prep and the ongoing raise narrative.' },
];

export const PROJECT_CHATS = [
  { title: 'Positioning & messaging', meta: '18 messages \u00B7 today' },
  { title: 'Competitor teardown', meta: '32 messages \u00B7 yesterday' },
  { title: 'Pricing experiments', meta: '9 messages \u00B7 Jun 12' },
  { title: 'Launch roadmap', meta: '24 messages \u00B7 Jun 10' },
];

export const PROJECT_FILES = [
  { name: 'positioning-brief.pdf', size: '240 KB' },
  { name: 'competitors.xlsx', size: '88 KB' },
  { name: 'pricing-model.csv', size: '12 KB' },
  { name: 'launch-checklist.md', size: '6 KB' },
  { name: 'user-interviews.docx', size: '156 KB' },
  { name: 'brand-guide.pdf', size: '1.2 MB' },
];

export const HISTORY_PAGE = [
  { label: 'Today', items: [
    { title: 'Build product roadmap', tag: 'AI Startup', when: '12m' },
    { title: 'Analyze competitors', tag: '', when: '1h' },
    { title: 'Create landing page', tag: 'Marketing', when: '3h' },
  ] },
  { label: 'Yesterday', items: [
    { title: 'Database architecture', tag: '', when: '1d' },
    { title: 'Write technical documentation', tag: 'Research Hub', when: '1d' },
  ] },
  { label: 'Previous 7 days', items: [
    { title: 'Create marketing strategy', tag: 'Marketing', when: '3d' },
    { title: 'Investor update draft', tag: '', when: '5d' },
    { title: 'Pricing model review', tag: 'AI Startup', when: '6d' },
  ] },
];

export const TASKS = [
  { title: 'Complete dashboard design', done: true, due: 'Due today', tag: 'Design' },
  { title: 'Review analytics report', done: true, due: 'Due today', tag: 'Analytics' },
  { title: 'Prepare launch plan', done: false, due: 'Due tomorrow', tag: 'Launch' },
  { title: 'Draft investor update', done: false, due: 'Due Fri', tag: 'Finance' },
  { title: 'Interview 3 beta users', done: false, due: 'Next week', tag: 'Research' },
];

export const HISTORY_FILTERS = ['All', 'Pinned', 'In projects', 'Archived'];

export const SETTINGS_TABS = [
  ['appearance', 'Appearance', 'palette'],
  ['general', 'General', 'settings'],
  ['notifications', 'Notifications', 'bell'],
  ['account', 'Account', 'user'],
];

export const THEME_CARDS = [
  { id: 'light', label: 'Light', swatch: '#ffffff', dot: 'rgba(0,0,0,.16)' },
  { id: 'dark', label: 'Dark', swatch: '#262624', dot: '#cd7f6a' },
];

export const PREFERENCES = [
  { key: 'suggestions', title: 'Show suggested prompts', sub: 'Display prompt cards on the new chat screen' },
  { key: 'streaming', title: 'Stream responses', sub: 'Reveal replies word by word as they generate' },
  { key: 'sounds', title: 'Interface sounds', sub: 'Play subtle sounds for key actions' },
  { key: 'entersends', title: 'Press Enter to send', sub: 'Use Shift+Enter for a new line' },
];

/** The demo conversation loaded when opening any saved chat. */
export function seedConversation() {
  return [
    { id: 's1', role: 'user', text: 'Help me put together a 90-day roadmap for launching my AI note-taking app.' },
    { id: 's2', role: 'ai', blocks: [
      { t: 'p', text: "Here's a focused 90-day launch roadmap. I've split it into three phases so each month has one clear theme and a shippable outcome." },
      { t: 'h3', text: 'Phase breakdown' },
      { t: 'ol', items: [
        'Month 1 \u2014 Foundation: lock the core capture-and-summarize loop, ship a private beta to 25 users.',
        'Month 2 \u2014 Refinement: instrument retention, add sync + search, open a public waitlist.',
        'Month 3 \u2014 Launch: pricing, onboarding polish, and a coordinated launch across your channels.',
      ] },
      { t: 'h3', text: 'Key metrics to watch' },
      { t: 'table', head: ['Metric', 'Target', 'Why it matters'], rows: [
        { cells: ['Week-1 retention', '40%', 'Signals the core loop is sticky'] },
        { cells: ['Notes / active user', '8+', 'Shows real habitual use'] },
        { cells: ['Beta \u2192 paid', '15%', 'Validates willingness to pay'] },
      ] },
      { t: 'p', text: 'A quick way to track weekly active notes on the client:' },
      { t: 'code', lang: 'typescript', code: 'function weeklyActive(notes: Note[]) {\n  const wk = 7 * 24 * 60 * 60 * 1000;\n  const since = Date.now() - wk;\n  return notes.filter(n => n.editedAt >= since).length;\n}' },
      { t: 'p', text: 'Want me to expand any phase into a week-by-week plan, or draft the launch-day checklist next?' },
    ] },
  ];
}

/** The canned assistant reply used by the streaming demo. */
export function answerFor(text) {
  const snip = text.slice(0, 60) + (text.length > 60 ? '\u2026' : '');
  return (
    'Great question. Here\u2019s how I\u2019d approach \u201C' + snip + '\u201D: start by clarifying the ' +
    'outcome you want, break it into two or three concrete milestones, then work the highest-leverage ' +
    'one first. I can draft a detailed plan, generate the assets, or dig into any single step \u2014 just ' +
    'tell me which direction is most useful and I\u2019ll take it from there.'
  );
}
