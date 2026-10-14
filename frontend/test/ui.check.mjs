/**
 * UI honesty checks — Phase 3 of the frontend cleanup.
 *
 *   node test/ui.check.mjs
 *
 * Asserts that no fabricated business data reaches the normal UI: no invented Overview figures,
 * chat history, tasks, projects, AI activity or canned transcripts, in either Classic or Hybrid.
 *
 * ## What this can and cannot see
 *
 * There is no React rendering harness here — like dashboards.check.mjs this runs under plain
 * `node`, no bundler. So it asserts three things it CAN check exactly:
 *
 *   1. the pure shared modules (empty-state copy, HR prompts, what remains in the fixtures);
 *   2. the SOURCE of every affected screen, in both styles — what it imports and references;
 *   3. the backend's own router and permission rules, which the example prompts depend on.
 *
 * Rendering is covered by `npm run build` compiling every screen; a DOM test harness would be
 * the next step if these screens grow logic of their own.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EMPTY, STATE_KIND, KIND_LABEL, COMING_SOON } from '../src/shared/data/emptyStates.js';
import { HR_PROMPTS, promptsFor, ROLE_RANK, SCOPE_MIN, MAX_PROMPTS } from '../src/shared/data/hrPrompts.js';
import * as mockData from '../src/shared/data/mockData.js';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { VIEW_PATH, pathFor, pathToView } from '../src/shared/lib/routes.js';
import { dataSourceInfo, normaliseDataSource, sourceKind, SOURCE_KIND } from '../src/shared/lib/dataSource.js';
import { profileFor, initialsOf, FALLBACK_NAME, FALLBACK_ROLE } from '../src/shared/lib/profile.js';

// The backend's composition root first, then the router and permission rules the prompts must
// agree with. Same order as backend/tests/check.mjs.
import '../../backend/functions/neuiq_api/src/integrations/registry.js';
import { keywordRoute } from '../../backend/functions/neuiq_api/src/core/orchestrator/index.js';
import { mayCall } from '../../backend/functions/neuiq_api/src/core/tools/registry.js';
import * as backendRoles from '../../backend/functions/neuiq_api/src/core/policy/roles.js';

let n = 0;
const ok = (fn, what) => { fn(); n++; console.log('ok  ', what); };

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(f) ? [p] : [];
});
/** Every UI source file, plus the shared files a screen can render from. */
const UI_FILES = [...walk(join(SRC, 'ui')), ...walk(join(SRC, 'shared'))]
  .map((p) => relative(SRC, p).replace(/\\/g, '/'));
const STYLES = ['classic', 'hybrid'];

const USER = (role) => ({ employeeId: 'E1', role });

// ---------------------------------------------------------------- empty states
ok(() => {
  const kinds = Object.values(STATE_KIND);
  assert.deepEqual(kinds.sort(), ['forbidden', 'no-records', 'not-connected', 'unavailable']);
  for (const k of kinds) assert.ok(KIND_LABEL[k], k);
  assert.equal(new Set(Object.values(KIND_LABEL)).size, kinds.length);
}, 'empty states: four distinct kinds — no records, not connected, unavailable, forbidden — each with its own label');
ok(() => {
  // "API failed" and "permission denied" must never read as "no records".
  assert.notEqual(KIND_LABEL[STATE_KIND.UNAVAILABLE], KIND_LABEL[STATE_KIND.NO_RECORDS]);
  assert.notEqual(KIND_LABEL[STATE_KIND.FORBIDDEN], KIND_LABEL[STATE_KIND.NO_RECORDS]);
}, 'empty states: an unavailable or forbidden state is never labelled "No records"');
ok(() => {
  const want = {
    overview: 'No usage data available yet',
    history: 'No saved conversations yet',
    tasks: 'Task management is not connected yet',
    projects: 'No projects available',
    projectWorkspace: 'Project workspace is not connected yet',
    aiActivity: 'No recent activity available',
  };
  for (const [key, title] of Object.entries(want)) assert.equal(EMPTY[key].title, title, key);
  for (const [key, s] of Object.entries(EMPTY)) {
    assert.equal(s.kind, STATE_KIND.NOT_CONNECTED, `${key}: nothing here has a source yet`);
    assert.ok(s.title && s.body && s.icon, key);
    assert.equal(/\d/.test(s.title + s.body), false, `${key}: an empty state contains no numbers`);
  }
}, 'empty states: every screen without a source says so — not connected, with no figures in the copy');

// ---------------------------------------------------------------- HR prompts
ok(() => {
  assert.deepEqual(ROLE_RANK, backendRoles.ROLE_RANK);
  assert.deepEqual(SCOPE_MIN, backendRoles.SCOPE_MIN);
}, 'prompts: the role and scope ranks are identical to the backend\'s');
ok(() => {
  for (const p of HR_PROMPTS) assert.equal(keywordRoute(p.prompt)?.tool, p.tool, p.prompt);
}, 'prompts: every example question really routes to the tool it advertises (backend keyword router)');
ok(() => {
  for (const role of ['employee', 'manager', 'hr_admin']) {
    const shown = promptsFor(USER(role));
    assert.ok(shown.length >= 1 && shown.length <= MAX_PROMPTS, role);
    for (const p of shown) assert.ok(mayCall(p.tool, USER(role)), `${role} is shown "${p.prompt}" but may not call ${p.tool}`);
    // Anything withheld is either not permitted, or trimmed by the card limit — never a usable
    // prompt hidden for no reason, never an unusable one shown.
    for (const p of HR_PROMPTS.filter((x) => !shown.includes(x))) {
      const permitted = mayCall(p.tool, USER(role));
      const allowedCount = HR_PROMPTS.filter((x) => mayCall(x.tool, USER(role))).length;
      assert.ok(!permitted || allowedCount > MAX_PROMPTS, `${role}: "${p.prompt}" withheld though permitted`);
    }
  }
}, 'prompts: each role is shown only questions the server will let it ask');
ok(() => {
  const tools = (role) => promptsFor(USER(role)).map((p) => p.tool);
  assert.equal(tools('employee').includes('zohoPeople.teamOnLeave'), false);
  assert.equal(tools('employee').includes('zohoPeople.headcount'), false);
  assert.ok(tools('manager').includes('zohoPeople.teamOnLeave'));
  assert.equal(tools('manager').includes('zohoPeople.headcount'), false);
  assert.ok(tools('hr_admin').includes('zohoPeople.headcount'), 'the admin prompt is never the one trimmed');
}, 'prompts: employees get no team or admin prompts; managers no admin prompt; HR admins keep theirs');
ok(() => {
  for (const user of [null, undefined, {}, USER('Admin'), USER('HR_ADMIN'), USER('constructor'), USER('__proto__')]) {
    assert.ok(promptsFor(user).every((p) => p.scope === 'self'), JSON.stringify(user));
  }
}, 'prompts: a missing, unknown or look-alike role gets self-scope prompts only');
ok(() => {
  const off = /react|roadmap|launch|code|competitor|document|startup/i;
  for (const p of HR_PROMPTS) assert.equal(off.test(p.prompt + p.title + p.sub), false, p.prompt);
}, 'prompts: no off-topic (non-HR) suggestions remain');

// ---------------------------------------------------------------- fixtures
ok(() => {
  // CHANGED in Phase 4: answerFor (the canned offline reply) and seedDashboards.js (the offline
  // dashboard fallback, which offered an admin-only dashboard to every role) were removed.
  assert.deepEqual(Object.keys(mockData).sort(), ['PREFERENCES']);
  assert.equal(existsSync(join(SRC, 'shared/data/seedDashboards.js')), false);
}, 'fixtures: mockData holds only settings labels; the offline seed dashboards are gone');

// ---------------------------------------------------------------- source checks, both styles
const FORBIDDEN_IMPORTS = [
  'STATS', 'USAGE_DAYS', 'USAGE_VALUES', 'ACTIVITY', 'RECENT_WORK', 'WIDGETS', 'GRID_PROJECTS',
  'PROJECT_CHATS', 'PROJECT_FILES', 'HISTORY_PAGE', 'HISTORY_GROUPS', 'HISTORY_FILTERS', 'TASKS',
  'SIDE_PROJECTS', 'PINNED', 'seedConversation', 'SEED_AI_ACTIVITY', 'SEED_SAVED_REPORTS',
];
ok(() => {
  for (const f of UI_FILES) {
    const src = read(f);
    for (const name of FORBIDDEN_IMPORTS) {
      assert.equal(new RegExp(`\\b${name}\\b`).test(src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')), false, `${f} references ${name}`);
    }
  }
}, 'source: no screen or shared module references a removed business fixture');
ok(() => {
  for (const f of UI_FILES) assert.equal(/\bloadConvo\b/.test(read(f).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')), false, f);
}, 'source: no path opens a canned conversation (loadConvo is gone everywhere)');
ok(() => {
  const LITERALS = [
    '1,284', '18.4k', 'AI Startup', 'Marketing System', 'Research Hub', '12 chats', '24 documents',
    'positioning-brief', 'Build product roadmap', '90-day', 'Share link copied', 'Exporting chat',
    'Interview 3 beta users', 'Answered "who is on leave today"', '+12% this week',
  ];
  for (const f of UI_FILES) {
    const code = read(f).replace(/\/\/.*$|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/gm, '');
    for (const lit of LITERALS) assert.equal(code.includes(lit), false, `${f} still renders "${lit}"`);
  }
}, 'source: no fabricated figure, title, file name or fake success toast is rendered anywhere');

const SCREENS = {
  'pages/Dashboard.jsx': 'EMPTY.overview',
  'pages/History.jsx': 'EMPTY.history',
  'pages/Tasks.jsx': 'EMPTY.tasks',
  'pages/ProjectsGrid.jsx': 'EMPTY.projects',
  'pages/ProjectWorkspace.jsx': 'EMPTY.projectWorkspace',
};
ok(() => {
  for (const style of STYLES) {
    for (const [file, state] of Object.entries(SCREENS)) {
      const src = read(`ui/${style}/${file}`);
      assert.ok(src.includes(state), `${style} ${file} shows ${state}`);
      assert.ok(src.includes("import EmptyPanel from '../components/EmptyPanel.jsx'"), `${style} ${file} uses its EmptyPanel`);
    }
  }
}, 'parity: Classic and Hybrid show the same honest state on Overview, History, Tasks, Projects and the workspace');
ok(() => {
  for (const style of STYLES) {
    const src = read(`ui/${style}/components/EmptyPanel.jsx`);
    assert.ok(src.includes('role="status"'), style);
    assert.ok(src.includes('KIND_LABEL[state.kind]'), `${style}: the kind badge is rendered`);
  }
}, 'parity: both EmptyPanels are announced to assistive tech and show the kind badge');
ok(() => {
  for (const style of STYLES) {
    const src = read(`ui/${style}/pages/EmptyState.jsx`);
    assert.ok(src.includes('promptsFor(app.user)'), `${style}: prompts are filtered by the signed-in role`);
    assert.equal(src.includes('live Zoho People data'), false, `${style}: no "live data" claim on the chat screen`);
  }
}, 'parity: both chat empty states show role-filtered HR prompts and make no "live data" claim');
ok(() => {
  assert.ok(read('ui/hybrid/pages/Ai.jsx').includes('EMPTY.aiActivity'));
  const side = read('ui/classic/components/Sidebar.jsx');
  assert.ok(side.includes('EMPTY.sidebarProjects') && side.includes('EMPTY.sidebarHistory'));
}, 'source: AI recent activity and the Classic sidebar lists show honest empty states');
ok(() => {
  for (const style of STYLES) {
    for (const file of ['pages/Tasks.jsx', 'pages/ProjectsGrid.jsx']) {
      const src = read(`ui/${style}/${file}`);
      assert.ok(src.includes('COMING_SOON'), `${style} ${file}: unsupported "New" action says Coming soon`);
    }
  }
  assert.equal(COMING_SOON, 'Coming soon');
}, 'source: unsupported "New task" / "New project" actions are labelled Coming soon, not presented as working');

// ---------------------------------------------------------------- navigation
ok(() => {
  for (const view of Object.keys(VIEW_PATH)) {
    const back = pathToView(pathFor(view));
    assert.ok(back, view);
    if (view !== 'empty') assert.equal(back, view === 'analytics' ? 'reports' : view, view);
  }
}, 'navigation: every route still resolves, including dashboard, history, tasks, projects and the workspace');
ok(() => {
  const PAGES = ['EmptyState', 'Dashboard', 'Ai', 'ProjectsGrid', 'ProjectWorkspace', 'History', 'Tasks', 'Settings'];
  for (const style of STYLES) {
    const shell = read(`ui/${style}/index.jsx`);
    for (const p of PAGES) assert.ok(shell.includes(`import ${p} from './pages/${p}.jsx'`), `${style} shell routes ${p}`);
  }
}, 'navigation: both shells still import and route every screen — nothing was hidden or deleted');

// ---------------------------------------------------------------- real data paths untouched
ok(() => {
  // CHANGED in Phase 4: this asserted that the fallback fired only offline. There is no fallback
  // now, so it asserts that useApi reports every failure as an error, and that both Widgets
  // classify failures through the shared errorState (403 -> "Not available on your account.").
  const hooks = read('shared/api/hooks.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.equal(/fallback/.test(hooks), false, 'useApi has no fallback');
  assert.ok(hooks.includes("setState({ data: null, loading: false, error: err, source: null })"));
  for (const style of STYLES) {
    assert.ok(read(`ui/${style}/components/Widget.jsx`).includes('errorState(error)'), `${style} Widget`);
  }
}, '403: a permission refusal still reaches the screen as itself; no failure becomes data');
ok(() => {
  const ctx = read('shared/context/AppContext.jsx');
  assert.ok(ctx.includes('api.chat(trimmed, history'), 'chat still goes to POST /chat');
  assert.ok(ctx.includes('typeOut(res.answer'), 'the backend answer is what is shown');
  const ai = read('ui/hybrid/pages/Ai.jsx');
  assert.ok(ai.includes('api.capabilities'), 'the AI tab still loads the real capability catalogue');
}, 'real API: chat answers and the /ai/capabilities catalogue still come from the backend');

// ---------------------------------------------------------------- Phase 1: data source
const LIVE = /\blive\b/i;
ok(() => {
  assert.equal(normaliseDataSource('seed'), 'seed');
  assert.equal(normaliseDataSource('zoho'), 'zoho');
  assert.equal(normaliseDataSource(undefined), undefined);
  for (const junk of [null, '', 'ZOHO', 'Zoho', 'live', true, 1, {}, ['zoho']]) assert.equal(normaliseDataSource(junk), null, String(junk));
}, 'data source: only the exact words seed/zoho are recognised; "Zoho", "live", true are not evidence');
ok(() => {
  const seed = dataSourceInfo({ dataSource: 'seed' });
  assert.equal(seed.kind, SOURCE_KIND.SEED);
  assert.equal(seed.banner, 'Demo data — not live Zoho People data');
  assert.equal(seed.live, false);
  assert.equal(seed.settings.value, 'Demo data');
  assert.equal(seed.settings.warn, true);
}, 'data source seed: the persistent banner says demo data, and Settings says Demo data with a warning');
ok(() => {
  const z = dataSourceInfo({ dataSource: 'zoho' });
  assert.equal(z.kind, SOURCE_KIND.ZOHO);
  assert.equal(z.banner, null);
  assert.equal(z.live, true);
  assert.equal(z.settings.value, 'Live Zoho People');
  assert.ok(LIVE.test(z.answers) && LIVE.test(z.builds));
}, 'data source zoho: no banner, and the only state allowed to say "live"');
ok(() => {
  for (const ds of [null, 'live', 'ZOHO', 42]) {
    const u = dataSourceInfo({ dataSource: ds });
    assert.equal(u.kind, SOURCE_KIND.UNKNOWN, String(ds));
    assert.equal(u.banner, 'Data source unavailable');
    assert.equal(u.settings.value, 'Data source unavailable');
    assert.equal(u.live, false);
  }
}, 'data source missing or unknown: "Data source unavailable", never live');
ok(() => {
  for (const ds of ['zoho', 'seed', null, undefined]) {
    const o = dataSourceInfo({ dataSource: ds, offline: true });
    assert.equal(o.kind, SOURCE_KIND.OFFLINE, String(ds));
    assert.equal(o.live, false);
    // CHANGED in Phase 4: offline used to mean "local samples are shown". Nothing is substituted
    // now, so the offline copy says the API is unavailable — and never mentions samples.
    assert.ok(/unavailable/i.test(o.banner) && /unavailable/i.test(o.settings.value));
    assert.equal(/sample/i.test(o.banner + o.settings.value + o.settings.hint + o.answers + o.builds), false);
  }
}, 'data source offline: "API unavailable", even if the backend once said zoho — and no mention of samples');
ok(() => {
  const p = dataSourceInfo({ dataSource: undefined });
  assert.equal(p.kind, SOURCE_KIND.PENDING);
  assert.equal(p.banner, null);
  assert.equal(p.live, false);
}, 'data source pending: before the backend answers, nothing is claimed either way');
ok(() => {
  // The one rule: "live" appears only for a reachable backend that reported zoho.
  for (const kind of Object.values(SOURCE_KIND)) {
    const info = dataSourceInfo({ dataSource: kind === 'zoho' ? 'zoho' : kind === 'seed' ? 'seed' : kind === 'pending' ? undefined : null, offline: kind === 'offline' });
    const claimsLive = [info.answers, info.builds, info.settings.value]
      .some((s) => LIVE.test(s) && !/not live/i.test(s) && !/may not be live/i.test(s));
    assert.equal(claimsLive, kind === SOURCE_KIND.ZOHO, kind);
  }
}, 'data source: no state but zoho claims live data in any sentence');
ok(() => {
  assert.equal(sourceKind({ dataSource: 'zoho', offline: false }), 'zoho');
  // Reachability alone is not a source.
  assert.notEqual(sourceKind({ dataSource: undefined, offline: false }), 'zoho');
  assert.notEqual(sourceKind({ dataSource: null, offline: false }), 'zoho');
}, 'data source: a reachable backend is never assumed to be live Zoho');

ok(() => {
  for (const style of STYLES) {
    const shell = read(`ui/${style}/index.jsx`);
    assert.ok(shell.includes("import DataSourceBanner from './components/DataSourceBanner.jsx'"), style);
    assert.ok(shell.includes('<DataSourceBanner />'), `${style} renders the banner`);
    const banner = read(`ui/${style}/components/DataSourceBanner.jsx`);
    assert.ok(banner.includes('dataInfo.banner') && banner.includes('role="status"'), style);
  }
}, 'data source: both shells render the same persistent, announced banner from the shared rule');
ok(() => {
  const PROVENANCE = {
    'ui/hybrid/components/Composer.jsx': 'app.dataInfo.answers',
    'ui/hybrid/pages/AiDashboards.jsx': 'dataInfo.builds',
    'ui/classic/pages/CustomDashboard.jsx': 'dataInfo.builds',
    'shared/lib/session.js': 'dataSourceInfo({ dataSource, offline })',
  };
  for (const [file, expr] of Object.entries(PROVENANCE)) assert.ok(read(file).includes(expr), `${file} derives provenance from ${expr}`);
  for (const f of UI_FILES.filter((x) => x !== 'shared/lib/dataSource.js')) {
    const code = read(f).replace(/\/\/.*$|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/gm, '');
    for (const claim of ['Live from the API', 'live Zoho People data', 'from your live data', 'answers from live']) {
      assert.equal(code.includes(claim), false, `${f} still claims "${claim}"`);
    }
  }
}, 'data source: Settings, Composer, AI Dashboards and the Classic builder say what the backend reported; no hardcoded "live" claim remains');
ok(() => {
  const ctx = read('shared/context/AppContext.jsx');
  assert.ok(ctx.includes('api.health()') && ctx.includes('normaliseDataSource(r?.dataSource ?? null)'), '/health is read');
  assert.ok(ctx.includes('dataSource: ds') && ctx.includes('setDataSource(normaliseDataSource(ds))'), '/me refreshes it');
  assert.ok(ctx.includes('dataSource, dataInfo,'), 'exposed to both styles through context');
}, 'data source: the frontend takes it from /health and /me and shares one value with both styles');

// ---------------------------------------------------------------- Phase 2: profile
ok(() => {
  const meera = profileFor({ name: 'Meera Iyer', username: 'meera', role: 'hr_admin' });
  assert.deepEqual([meera.name, meera.initials, meera.role, meera.firstName, meera.username], ['Meera Iyer', 'MI', 'HR admin', 'Meera', 'meera']);
  const rohit = profileFor({ name: 'Rohit Sharma', role: 'manager' });
  assert.deepEqual([rohit.name, rohit.initials, rohit.role], ['Rohit Sharma', 'RS', 'Manager']);
  const alex = profileFor({ name: 'Alex Mathew', role: 'employee' });
  assert.deepEqual([alex.initials, alex.role], ['AM', 'Employee']);
}, 'profile: switching account switches name, initials and role — Meera, Rohit and Alex each see themselves');
ok(() => {
  for (const user of [null, undefined, {}, { name: '' }, { name: '   ' }, { name: 42 }, { role: 'manager' }]) {
    const p = profileFor(user);
    assert.equal(p.name, FALLBACK_NAME, JSON.stringify(user));
    assert.equal(p.firstName, null);
    assert.equal(p.initials, '');
    assert.equal(p.known, false);
  }
  assert.equal(profileFor({ name: 'Priya Nair' }).role, FALLBACK_ROLE);
  assert.equal(profileFor({ name: 'Priya Nair', role: '' }).role, FALLBACK_ROLE);
  assert.equal(FALLBACK_NAME, 'User');
}, 'profile: a missing name is "User" with no initials or first name; a missing role is "Role unavailable" — no invented person');
ok(() => {
  assert.equal(initialsOf('  meera   iyer '), 'MI');
  assert.equal(initialsOf('Priya'), 'P');
  assert.equal(initialsOf('Jean-Luc Picard'), 'JP');
  assert.equal(initialsOf('Ana María López'), 'AL');
  assert.equal(initialsOf('42 Rohit'), 'R');
  assert.equal(initialsOf('— !'), '');
}, 'profile: initials are letters from the real name, at most two');

ok(() => {
  const side = read('ui/classic/components/Sidebar.jsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  assert.ok(side.includes('profileFor(app.user)'));
  for (const lit of ['Alex Morgan', 'Pro plan', '>AM<']) assert.equal(side.includes(lit), false, lit);
  assert.ok(side.includes('{me.name}') && side.includes('{me.role}') && side.includes('me.initials'));
}, 'profile (Classic): the sidebar shows the authenticated user — no "Alex Morgan", "AM" or "Pro plan"');
ok(() => {
  const top = read('ui/hybrid/components/TopBar.jsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  assert.ok(top.includes('profileFor(app.user)'));
  assert.ok(top.includes('{me.name}') && top.includes('{me.role}'));
}, 'profile (Hybrid): the account menu shows the same authenticated name and role as Classic');
ok(() => {
  const ctx = read('shared/context/AppContext.jsx');
  const code = ctx.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  assert.equal(/greetingName/.test(code), false, 'no default greeting name');
  assert.equal(/['"]Alex['"]/.test(code), false, 'no "Alex" anywhere in the context');
  assert.ok(code.includes('profileFor(user).firstName'), 'greeting uses the real first name');
  assert.ok(code.includes("who ? `Good ${part}, ${who}` : `Good ${part}`"), 'and none at all when there is no name');
  // CHANGED in Phase 4: this asserted the offline local session had no name. There is no offline
  // local session at all now — an unreachable server signs nobody in.
  assert.equal(/offline:\s*true/.test(code), false, 'no offline local session exists');
}, 'profile: no hardcoded "Alex" greeting or offline identity; the greeting names only a real user');
ok(() => {
  for (const f of UI_FILES) {
    const code = read(f).replace(/\/\/.*$|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/gm, '');
    for (const lit of ['Alex Morgan', 'Alex Mathew', 'alex@neuiq.com', 'Pro plan']) assert.equal(code.includes(lit), false, `${f}: ${lit}`);
  }
}, 'profile: no invented person or plan appears in any UI file, including sign-in placeholders');
ok(() => {
  const ctx = read('shared/context/AppContext.jsx');
  assert.ok(ctx.includes("const doAuth = useCallback(async (username = 'alex')"), 'demo sign-in default unchanged');
  assert.ok(ctx.includes('api.login('), 'demo sign-in still posts to /auth/login');
  for (const style of STYLES) assert.ok(read(`ui/${style}/pages/Auth.jsx`).includes('demoUsers'), `${style}: demo account picker kept`);
}, 'profile: seed demo sign-in behaviour is preserved (secure Zoho sign-in is a later phase)');

// ---------------------------------------------------------------- Phase 4: offline is unavailable
// These run the REAL shared data layer — API client, resolveQuery, buildDashboard — with fetch
// stubbed to be unreachable, to refuse (403), to fail (500) or to answer. The `@shared/` alias is
// a bundler alias, so a tiny resolver maps it for plain node. React hooks cannot run without a
// renderer; their wiring is checked from source below.
const SHARED_URL = pathToFileURL(join(SRC, 'shared')).href + '/';
register('data:text/javascript,' + encodeURIComponent(`
  const SHARED = ${JSON.stringify(SHARED_URL)};
  export async function resolve(spec, ctx, next) {
    if (spec.startsWith('@shared/')) {
      let rest = spec.slice('@shared/'.length);
      if (!/\\.[cm]?jsx?$/.test(rest)) rest += '/index.js';
      return next(SHARED + rest, ctx);
    }
    return next(spec, ctx);
  }`));

let mode = 'ok';
let okBody = {};
globalThis.fetch = async () => {
  if (mode === 'offline') throw new TypeError('fetch failed');
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-request-id': 'test' } });
  if (mode === 'forbidden') return json(403, { success: false, error: '"Employees" is not readable from this account' });
  if (mode === 'server') return json(500, { success: false, error: 'Something went wrong on our side.' });
  return json(200, { requestId: 'test', success: true, ...okBody });
};
const { resolveQuery, buildDashboard } = await import('../src/shared/dashboards/index.js');
const { api } = await import('../src/shared/api/index.js');
const { errorState, actionFailedMessage, CONNECTION } = await import('../src/shared/data/emptyStates.js');
const SPEC = { source: 'leave', groupBy: 'status', metric: 'count' };
const fails = async (p) => { try { await p; return null; } catch (e) { return e; } };

await (async () => {
  mode = 'offline';
  const e = await fails(resolveQuery(SPEC));
  assert.ok(e, 'an unreachable query must reject, not resolve');
  assert.equal(e.offline, true);
  const s = errorState(e);
  assert.equal(s.kind, STATE_KIND.UNAVAILABLE);
  assert.equal(s.title, 'API unavailable');
  n++; console.log('ok   offline analytics: an unreachable query rejects and reads "API unavailable" — no sample rows, no zero');
})();

await (async () => {
  mode = 'forbidden';
  const e = await fails(resolveQuery({ source: 'employees', groupBy: 'department', metric: 'count' }));
  assert.equal(e?.status, 403);
  assert.equal(errorState(e).kind, STATE_KIND.FORBIDDEN);
  assert.equal(errorState(e).title, 'Not available on your account.');
  mode = 'server';
  const s = await fails(resolveQuery(SPEC));
  assert.equal(s?.status, 500);
  assert.equal(errorState(s).kind, STATE_KIND.UNAVAILABLE);
  n++; console.log('ok   403 vs failure: a refusal is "not permitted", a 500 is "unavailable" — three distinct answers, none of them data');
})();

await (async () => {
  mode = 'ok';
  okBody = { data: [{ name: 'Approved', value: 3, count: 3 }, { name: 'Pending', value: 1, count: 1 }], meta: { source: 'leave' } };
  const r = await resolveQuery(SPEC);
  assert.equal(r.source, 'api');
  assert.deepEqual(r.data, okBody.data);
  n++; console.log('ok   real API: a successful query still returns exactly the server\'s rows');
})();

await (async () => {
  mode = 'offline';
  const e = await fails(buildDashboard('headcount by department and leave by status'));
  assert.ok(e?.offline, 'no offline builder: nothing is generated');
  assert.equal(actionFailedMessage(e, CONNECTION.buildFailed), CONNECTION.buildFailed);
  mode = 'ok';
  okBody = { title: 'Leave', source: 'fallback', widgets: [{ type: 'bar', title: 'By status', query: SPEC }, { type: 'bar', query: { source: 'salaries' } }] };
  const b = await buildDashboard('leave by status');
  assert.equal(b.title, 'Leave');
  assert.equal(b.widgets.length, 1, 'the server spec is still re-whitelisted');
  n++; console.log('ok   offline dashboards: building fails honestly offline (no client-made spec, so no admin widget for an employee); online still works');
})();

await (async () => {
  mode = 'offline';
  for (const [name, call] of [
    ['login', () => api.login('alex')],
    ['chat', () => api.chat('how much leave do I have left?')],
    ['analytics', () => api.analyticsSummary()],
    ['dashboards.create', () => api.dashboards.create('x', [])],
    ['dashboards.list', () => api.dashboards.list()],
  ]) {
    const e = await fails(call());
    assert.ok(e?.offline, `${name} must reject offline`);
  }
  mode = 'ok';
  n++; console.log('ok   offline API: login, chat, analytics and dashboard reads/writes all reject — none resolves to a stand-in');
})();

ok(() => {
  const off = { offline: true, message: 'Cannot reach the NeuIQ API.' };
  assert.equal(actionFailedMessage(off), CONNECTION.notSaved);
  assert.ok(/not saved/i.test(CONNECTION.notSaved));
  assert.equal(actionFailedMessage({ status: 403, message: 'x' }), 'Not available on your account.');
  assert.equal(actionFailedMessage({ status: 400, message: 'Title too long' }), 'Title too long');
  assert.equal(CONNECTION.signIn, 'Sign-in unavailable — cannot connect to server');
  for (const err of [off, { status: 403 }, { status: 500 }, { status: 404 }, {}]) {
    assert.notEqual(errorState(err).kind, STATE_KIND.NO_RECORDS, JSON.stringify(err));
  }
}, 'failed saves say "Not saved"; no failure of any kind is ever classified as "No records"');

ok(() => {
  // No runtime path to any sample fixture remains. spec.js keeps them for the contract tests only.
  const SAMPLES = ['sampleQuery', 'sampleBuild', 'SAMPLE_KPIS', 'SAMPLE_ROWS', 'SEED_DASHBOARDS', 'answerFor', 'seedDashboards'];
  for (const f of UI_FILES.filter((x) => x !== 'shared/dashboards/spec.js')) {
    const code = read(f).replace(/\/\/.*$|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/gm, '');
    for (const s of SAMPLES) assert.equal(new RegExp(`\\b${s}\\b`).test(code), false, `${f} references ${s}`);
    assert.equal(/fallback\s*:/.test(code), false, `${f} passes a fallback`);
    assert.equal(/source:\s*'sample'/.test(code), false, `${f} produces a 'sample' result`);
  }
}, 'no runtime file references a sample fixture, passes a fallback, or produces a "sample" result');

ok(() => {
  const ctx = read('shared/context/AppContext.jsx').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  const doAuth = ctx.slice(ctx.indexOf('const doAuth'), ctx.indexOf('const enterAuth'));
  const fail = doAuth.slice(doAuth.indexOf('catch (err)'));
  assert.equal(/setAuthed\(true\)|setUser\(/.test(fail), false, 'a failed sign-in authenticates nobody');
  assert.ok(fail.includes('CONNECTION.signIn'), 'and says sign-in is unavailable');
  assert.equal(/offline:\s*true/.test(ctx), false, 'no locally-fabricated offline user');
  assert.ok(doAuth.includes('api.login('), 'demo login against a reachable server is unchanged');
}, 'offline login: refused with "Sign-in unavailable — cannot connect to server"; no local user is created');

ok(() => {
  const ctx = read('shared/context/AppContext.jsx').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  const send = ctx.slice(ctx.indexOf('const send = useCallback'), ctx.indexOf('const retryMessage'));
  const offline = send.slice(send.indexOf('err.offline'), send.indexOf('} else {', send.indexOf('err.offline')));
  assert.ok(offline.includes("role: 'notice'") && offline.includes('CONNECTION.chatNotSent'), 'a notice, not a reply');
  assert.ok(offline.includes('retryText: trimmed') && offline.includes('retryOf: um.id'), 'retryable');
  assert.equal(/typeOut\(|role: 'ai'/.test(offline), false, 'no assistant reply is produced');
  assert.ok(send.includes(".filter((m) => m.role !== 'notice')"), 'notices are never sent as conversation history');
  assert.ok(send.includes('typeOut(res.answer'), 'a real answer still shows');
  assert.ok(ctx.includes('retryMessage, pinAnswer'), 'retry is exposed to both styles');
}, 'offline chat: the question stays, a retryable "not sent" notice appears, no reply is invented, history excludes it');

ok(() => {
  for (const style of STYLES) {
    const conv = read(`ui/${style}/pages/Conversation.jsx`);
    assert.ok(conv.includes("m.role === 'notice'") && conv.includes('<ChatNotice key={m.id} notice={m} />'), `${style} renders notices`);
    const msg = read(`ui/${style}/components/ChatMessage.jsx`);
    const notice = msg.slice(msg.indexOf('export function ChatNotice'));
    assert.ok(notice.includes('role="alert"') && notice.includes('app.retryMessage(notice)'), `${style} notice is announced and retryable`);
    assert.equal(/AiAvatar|Pin as widget|thumbsUp/.test(notice.slice(0, notice.indexOf('\n}') + 2)), false, `${style}: a notice is not an answer`);
    assert.equal(/'sample'/.test(msg), false, `${style}: no sample pill`);
  }
}, 'offline chat (both styles): the notice is its own component — no assistant avatar, no answer actions, a Retry');

ok(() => {
  const dash = read('shared/dashboards/useDashboards.js').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  assert.equal(/local:\s*true|isOfflineErr|localId/.test(dash), false, 'no in-memory "saved" rows');
  const create = dash.slice(dash.indexOf('const create'), dash.indexOf('const rename'));
  assert.equal(/catch/.test(create), false, 'create never swallows a failure');
  const remove = dash.slice(dash.indexOf('const remove'));
  assert.ok(remove.includes('if (err.status !== 404) throw err;'), 'a delete that did not happen is not removed from screen');
  assert.equal(/fallback/.test(dash), false, 'no seed list fallback');
}, 'failed saves: create/rename/duplicate/delete only change the screen when the server confirmed them');

ok(() => {
  for (const f of ['ui/classic/pages/CustomDashboard.jsx', 'ui/hybrid/pages/AiDashboards.jsx']) {
    const src = read(f);
    assert.ok(src.includes('app.pushToast(actionFailedMessage(err))'), `${f}: failure toast is honest`);
    assert.ok(src.includes('dash.error ?') && src.includes('errorState(dash.error)'), `${f}: a failed list is not "No dashboards yet"`);
    assert.equal(/'built offline'|dash\.source === 'sample'/.test(src), false, f);
  }
  const cb = read('ui/hybrid/pages/ChartBuilder.jsx');
  const cbCode = cb.replace(/\/\/.*$|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/gm, '');
  assert.equal(cbCode.includes('(offline)'), false, 'no "Saved to dashboards (offline)."');
  assert.ok(cb.includes('actionFailedMessage(err)') && cb.includes('errorState(metaError)'));
  const rep = read('ui/hybrid/pages/Reports.jsx');
  assert.ok(rep.includes('errorState(dash.error)'));
  assert.equal(rep.includes(": 'local'"), false);
  for (const style of STYLES) {
    const ai = read(`ui/${style}/pages/Ai.jsx`);
    assert.ok(ai.includes('errorState(error)'), `${style} AI page shows the failure`);
    assert.equal(/schemaFor\(/.test(ai), false, `${style} AI page invents no capability list`);
  }
}, 'dashboards, Chart Builder, Reports and AI pages (both styles): failures shown as failures, never as saved or as a stand-in list');

// ---------------------------------------------------------------- Phase 5.2: auth mode on the sign-in screen
const { loginOptions, normaliseAuthMode, SIGN_IN_COPY, ZOHO_SIGN_IN_AVAILABLE } = await import('../src/shared/lib/authMode.js');

ok(() => {
  assert.equal(normaliseAuthMode('demo'), 'demo');
  assert.equal(normaliseAuthMode('zoho'), 'zoho');
  assert.equal(normaliseAuthMode(undefined), undefined);
  for (const junk of [null, '', 'DEMO', 'Demo', 'sso', true, 1, {}]) assert.equal(normaliseAuthMode(junk), null, String(junk));
}, 'auth mode: only the exact words demo/zoho count; "Demo", "sso", true are unknown');
ok(() => {
  const d = loginOptions({ authMode: 'demo' });
  assert.equal(d.kind, 'demo');
  assert.equal(d.allowDemo, true);
  assert.equal(d.showZoho, true);
  assert.equal(d.zoho.enabled, false, 'Zoho sign-in is not built, even in demo mode');
}, 'sign-in (demo): the picker and username form are offered; Zoho is shown but disabled');
ok(() => {
  const z = loginOptions({ authMode: 'zoho' });
  assert.equal(z.kind, 'zoho');
  assert.equal(z.allowDemo, false, 'no demo sign-in in zoho mode');
  assert.equal(z.showZoho, true);
  assert.equal(z.zoho.enabled, false);
  assert.equal(z.zoho.label, 'Continue with Zoho');
  assert.equal(z.zoho.note, 'Not configured yet');
  assert.equal(z.message, SIGN_IN_COPY.zohoNotConfigured);
  assert.equal(ZOHO_SIGN_IN_AVAILABLE, false);
}, 'sign-in (zoho): "Continue with Zoho" is shown, disabled and marked "Not configured yet" — no demo picker');
ok(() => {
  for (const authMode of [null, 'sso', 'DEMO', '', 42]) {
    const u = loginOptions({ authMode });
    assert.equal(u.kind, 'unavailable', String(authMode));
    assert.equal(u.allowDemo, false);
    assert.equal(u.showZoho, false);
    assert.equal(u.message, SIGN_IN_COPY.unknown);
  }
  const p = loginOptions({ authMode: undefined });
  assert.equal(p.kind, 'pending');
  assert.equal(p.allowDemo, false, 'nothing is offered before the backend answers');
}, 'sign-in (missing or unknown mode): fails closed — no demo sign-in, no Zoho control, a plain message');
ok(() => {
  for (const authMode of ['demo', 'zoho', undefined, null]) {
    const o = loginOptions({ authMode, offline: true });
    assert.equal(o.allowDemo, false, String(authMode));
    assert.equal(o.message, 'Sign-in unavailable — cannot connect to server');
  }
}, 'sign-in (offline): unavailable, even if the backend last said demo');

ok(() => {
  for (const style of STYLES) {
    const src = read(`ui/${style}/pages/Auth.jsx`);
    const code = src.replace(/\/\/.*$|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/gm, '');
    assert.ok(code.includes('const opts = app.signInOptions;'), `${style}: uses the shared sign-in options`);
    assert.ok(code.includes('opts.allowDemo && app.demoUsers.length > 0 && ('), `${style}: picker only in demo mode`);
    assert.ok(/if \(opts\.allowDemo\) app\.doAuth\(/.test(code), `${style}: the username form only signs in in demo mode`);
    assert.ok(code.includes('disabled={!opts.zoho.enabled}'), `${style}: the Zoho control is disabled until it works`);
    assert.ok(code.includes('{opts.message}'), `${style}: non-demo modes say why`);
    assert.equal(/Continue with SSO/.test(code), false, `${style}: no SSO button that secretly runs demo sign-in`);
    // Every remaining doAuth call is behind allowDemo or inside the demo-only picker.
    const calls = code.match(/app\.doAuth\(/g) || [];
    assert.equal(calls.length, 2, `${style}: exactly the guarded form submit and the demo-only picker`);
  }
  const classic = read('ui/classic/pages/Auth.jsx');
  assert.ok(classic.includes('{opts.allowDemo ? ('), 'Classic: the form exists only in demo mode');
  const hybrid = read('ui/hybrid/pages/Auth.jsx');
  assert.ok(/\{opts\.allowDemo && \(\s*<form/.test(hybrid), 'Hybrid: the form exists only in demo mode');
}, 'sign-in screens (Classic and Hybrid): the same rules — picker and form demo-only, Zoho disabled, no hidden demo path');

ok(() => {
  const ctx = read('shared/context/AppContext.jsx').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  assert.ok(ctx.includes('setAuthMode(normaliseAuthMode(r?.authMode ?? null))'), 'authMode comes from /health');
  assert.ok(ctx.includes("if (authMode !== 'demo') { setDemoUsers([]); return undefined; }"), 'demo accounts are requested only in demo mode');
  const doAuth = ctx.slice(ctx.indexOf('const doAuth'), ctx.indexOf('const enterAuth'));
  const firstLine = doAuth.split('\n').find((l) => l.trim() && !l.includes('const doAuth'));
  assert.ok(firstLine.includes("if (authModeRef.current !== 'demo')"), 'doAuth refuses before doing anything else outside demo mode');
  assert.ok(ctx.includes('signInOptions'), 'both styles read the same options from context');
}, 'sign-in (context): demo accounts and demo sign-in only when the backend reported demo — checked before any request');

await (async () => {
  // End to end through the real client: whatever /health reports decides the options.
  okBody = { status: 'up', dataSource: 'seed', authMode: 'zoho' };
  mode = 'ok';
  const health = await api.health();
  const opts = loginOptions({ authMode: normaliseAuthMode(health.authMode) });
  assert.equal(opts.allowDemo, false);
  okBody = { status: 'up', dataSource: 'seed' };                  // an older backend: no authMode
  const old = await api.health();
  assert.equal(loginOptions({ authMode: normaliseAuthMode(old.authMode ?? null) }).allowDemo, false);
  n++; console.log('ok   sign-in (via the API client): a zoho or silent backend never yields demo sign-in');
})();

console.log(`\nall ${n} UI checks pass`);
