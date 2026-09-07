import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { seedConversation, answerFor } from '../data/mockData.js';
import { pathToView, pathFor } from '../lib/routes.js';
import { THEMES, THEME_IDS, ACCENT_IDS, isDarkTheme } from '../lib/theme.js';
import { api, setToken, getToken, ApiError, useOffline } from '../api/index.js';

/** App-wide defaults (were DC props). Change these to reconfigure the demo. */
export const CONFIG = {
  uiStyle: 'classic',      // 'classic' | 'hybrid' | 'modern' — which layout renders
  defaultTheme: 'light',   // any id from THEMES in ../lib/theme.js
  accent: '',              // any id from ACCENTS; '' keeps the style's own base accent
  greetingName: 'Alex',
  density: 'comfortable',  // 'comfortable' | 'compact'
};

/**
 * localStorage, defensively.
 *
 * Reads are validated against the allowed ids rather than trusted: a value left behind by an
 * older build (or edited by hand) would otherwise set an attribute no stylesheet defines, and
 * the app would render unstyled with nothing in the console to explain why.
 * Writes are swallowed because private browsing throws on setItem.
 */
const read = (key, fallback, allowed) => {
  try {
    const v = localStorage.getItem(key);
    return v !== null && (!allowed || allowed.includes(v)) ? v : fallback;
  } catch { return fallback; }
};
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

let TOAST_ID = 0;

export function AppProvider({ children }) {
  // ---- core state (mirrors the original component) ----
  // UI style resolves in precedence order: ?ui= in the URL (so a style can be linked and
  // demoed without touching code), then the last choice, then CONFIG.
  // Appearance is SHARED, not per-style: a theme is a palette, a UI style is a layout, and
  // switching one should not reset the other. Both are remembered across sessions.
  const [theme, setThemeRaw] = useState(() => read('neuiq_theme', CONFIG.defaultTheme, THEME_IDS));
  const [accent, setAccentRaw] = useState(() => read('neuiq_accent', CONFIG.accent || '', ACCENT_IDS));
  const setTheme = useCallback((v) => { setThemeRaw(v); write('neuiq_theme', v); }, []);
  const setAccent = useCallback((v) => { setAccentRaw(v); write('neuiq_accent', v); }, []);

  const [uiStyle, setUiStyleRaw] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('ui');
      if (q && ['classic', 'modern', 'hybrid'].includes(q)) return q;
      return localStorage.getItem('neuiq_ui') || CONFIG.uiStyle;
    } catch { return CONFIG.uiStyle; }
  });
  const setUiStyle = useCallback((v) => { setUiStyleRaw(v); write('neuiq_ui', v); }, []);
  // `view` is derived from the URL, not stored. The address bar is the single source of
  // truth for which screen is open, so deep links and refresh land on the right one.
  const location = useLocation();
  const navigate = useNavigate();
  const view = pathToView(location.pathname) || 'chat';
  const [collapsed, setCollapsed] = useState(false);
  const [incognito, setIncognito] = useState(false);
  const [composer, setComposer] = useState('');
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [messages, setMessages] = useState([]);
  const [settingsTab, setSettingsTab] = useState('appearance');
  const [projTab, setProjTab] = useState('chats');
  const [pgTab, setPgTab] = useState('your');
  const [histFilter, setHistFilter] = useState('All');
  const [toasts, setToasts] = useState([]);
  const [landing, setLanding] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [authView, setAuthView] = useState('login');
  const [density, setDensity] = useState(CONFIG.density === 'compact' ? 'compact' : 'comfortable');
  const [rowMenu, setRowMenu] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(248);
  const [resizing, setResizing] = useState(false);
  const [prefs, setPrefs] = useState({ suggestions: true, streaming: true, sounds: false, entersends: true });

  const timers = useRef([]);
  const themeBeforeIncognito = useRef(null);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // Mirror a few values into refs so async callbacks read fresh state without
  // nesting cross-setter updates (avoids stale closures + React warnings).
  const composerRef = useRef('');
  const streamingRef = useRef(false);
  const incognitoRef = useRef(false);
  const streamTextRef = useRef('');
  const messagesRef = useRef([]);
  const prefsRef = useRef(prefs);
  composerRef.current = composer;
  streamingRef.current = streaming;
  incognitoRef.current = incognito;
  streamTextRef.current = streamText;
  messagesRef.current = messages;
  prefsRef.current = prefs;

  /** The in-flight chat request, so the stop button aborts it instead of leaving it to land
   *  after the user has moved on. */
  const chatCtl = useRef(null);

  // ---- toasts ----
  const pushToast = useCallback((text) => {
    const id = ++TOAST_ID;
    setToasts((t) => [...t, { id, text }]);
    const h = setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2000);
    timers.current.push(h);
  }, []);
  const toast = useCallback(() => pushToast('Coming soon'), [pushToast]);

  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = document.querySelector('[data-nr-scroll="1"]');
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // ---- navigation ----
  const go = useCallback((v) => {
    navigate(pathFor(v));
    setIncognito((cur) => (v === 'incognito' ? true : v === 'chat' || v === 'empty' ? cur : false));
  }, [navigate]);

  const newChat = useCallback(() => {
    clearTimers();
    navigate(pathFor('empty')); setIncognito(false); setMessages([]);
    setThinking(false); setStreaming(false); setStreamText(''); setComposer('');
  }, [navigate]);

  const toggleSidebar = useCallback(() => setCollapsed((c) => !c), []);

  const toggleIncognito = useCallback(() => {
    const next = !incognitoRef.current;
    setIncognito(next);
    // Incognito forces a dark theme, then restores whatever you were on - not the app
    // default, which would quietly discard your choice every time you used a private chat.
    if (next) { themeBeforeIncognito.current = theme; if (!isDarkTheme(theme)) setTheme('dark'); }
    else setTheme(themeBeforeIncognito.current || CONFIG.defaultTheme);
    navigate(pathFor(next ? 'incognito' : 'empty'));
    setMessages([]); setStreamText(''); setStreaming(false); setThinking(false);
  }, [navigate, theme, setTheme]);

  const loadConvo = useCallback(() => {
    clearTimers();
    navigate(pathFor('chat')); setIncognito(false); setMessages(seedConversation());
    setThinking(false); setStreaming(false); setStreamText(''); setComposer('');
    scrollBottom();
  }, [scrollBottom, navigate]);

  // ---- theme ----
  const themeLabel = (id) => THEMES.find((t) => t.id === id)?.label || id;

  /** Step through every theme in order. The toast names it, because after two presses you
   *  have lost track of where in the list you are. */
  const cycleTheme = useCallback(() => {
    const next = THEME_IDS[(THEME_IDS.indexOf(theme) + 1) % THEME_IDS.length];
    setTheme(next);
    pushToast('Theme: ' + (THEMES.find((t) => t.id === next)?.label || next));
  }, [theme, setTheme, pushToast]);

  // ---- composer / streaming ----
  /**
   * Commit a finished answer to the transcript.
   *
   * `meta` carries what the backend told us about the answer — which tool ran, whether it was
   * refused, and whether the figures came from the API or from local sample data. The bubble
   * renders it as a footer, because "where did this number come from" is the first question
   * anyone asks of an HR figure and the answer should be on screen, not in a console.
   */
  const finish = useCallback((full, meta = null) => {
    const am = { id: 'a' + Date.now(), role: 'ai', blocks: [{ t: 'p', text: full }], meta };
    setMessages((m) => [...m, am]);
    setStreaming(false); setThinking(false); setStreamText('');
    scrollBottom();
  }, [scrollBottom]);

  /**
   * Type an answer out rather than dropping it in whole.
   *
   * The backend answers in a few milliseconds, which reads as a glitch — the text simply appears
   * and you cannot tell whether it responded to your question or was already there. The typing
   * is presentation, not a stream: the whole answer is already in hand, so it can be interrupted
   * safely and `stop()` keeps what has been shown so far.
   */
  const typeOut = useCallback((full, meta) => {
    setThinking(false);
    if (!prefsRef.current.streaming) { finish(full, meta); return; }
    let i = 0;
    const step = () => {
      i += Math.max(2, Math.round(full.length / 70));
      setStreamText(full.slice(0, i));
      scrollBottom();
      if (i < full.length) { const h = setTimeout(step, 22); timers.current.push(h); }
      else finish(full, meta);
    };
    step();
  }, [finish, scrollBottom]);

  /**
   * Ask the orchestrator a question.
   *
   * The answer text is written by the backend tool that fetched the data, never assembled here —
   * that is the whole point of the design in docs/backend/04-orchestrator.md, and the moment this
   * function starts composing sentences from `res.data` the guarantee is gone.
   */
  const send = useCallback(async () => {
    const trimmed = composerRef.current.trim();
    if (!trimmed || streamingRef.current) return;
    const um = { id: 'u' + Date.now(), role: 'user', text: trimmed };
    setMessages((m) => [...m, um]);
    setComposer('');
    navigate(pathFor(incognitoRef.current ? 'incognito' : 'chat'));
    setThinking(true);
    setStreaming(true);
    setStreamText('');
    scrollBottom();

    /**
     * The last few turns only. The orchestrator needs them to resolve a follow-up like
     * "and last month?", but sending the whole transcript grows every request without
     * improving the answer — and in a private chat there is nothing to carry forward at all.
     */
    const history = incognitoRef.current ? [] : messagesRef.current.slice(-6).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      text: m.role === 'user' ? m.text : (m.blocks || []).map((b) => b.text).join(' '),
    }));

    const ctl = new AbortController();
    chatCtl.current = ctl;
    try {
      const res = await api.chat(trimmed, history, { signal: ctl.signal });
      if (ctl.signal.aborted) return;
      typeOut(res.answer, {
        tool: res.tool, outcome: res.outcome, source: res.source, pinnable: res.pinnable || null,
      });
    } catch (err) {
      if (ctl.signal.aborted) return;
      if (err instanceof ApiError && err.offline) {
        // The API is down. Local sample answers keep the demo usable, but the bubble is
        // labelled 'sample' so nobody reads a made-up figure as a Zoho one.
        typeOut(answerFor(trimmed), { source: 'sample', outcome: 'ok' });
      } else {
        // A 403 or a 400 is a real answer about what you may ask. Show it as itself rather
        // than substituting sample data, which would misrepresent your permissions.
        typeOut(err.message, { outcome: 'error' });
      }
    } finally {
      if (chatCtl.current === ctl) chatCtl.current = null;
    }
  }, [scrollBottom, typeOut, navigate]);

  const stop = useCallback(() => {
    clearTimers();
    // Abort the request too, not just the typing — otherwise a slow answer arrives after you
    // asked it to stop and appends itself to the transcript.
    chatCtl.current?.abort();
    chatCtl.current = null;
    const full = streamTextRef.current;
    if (full) finish(full, { outcome: 'stopped' });
    else { setStreaming(false); setThinking(false); }
  }, [finish]);

  const sendOrStop = useCallback(() => { if (streamingRef.current) stop(); else send(); }, [stop, send]);

  /**
   * Pin a chat answer as a live dashboard tile.
   *
   * The tile stores the QUESTION the answer came from, never the number that was on screen —
   * `pinnable.widget` is a spec with relative parameters, so the tile re-resolves against the
   * caller's own permissions every time it is opened and stays current. Pinning the figure
   * instead would freeze a value that has already escaped whoever's access produced it.
   */
  const pinAnswer = useCallback(async (pinnable) => {
    if (!pinnable?.widget) return;
    try {
      await api.dashboards.create(pinnable.suggestedTitle || 'Pinned answer', [pinnable.widget]);
      pushToast('Pinned to your dashboards.');
    } catch (err) {
      // Nowhere to pin it: saying so beats a toast that claims success against a store that
      // was never written to.
      pushToast(err instanceof ApiError && err.offline
        ? 'Cannot pin while the API is offline.'
        : err.message || 'Could not pin that.');
    }
  }, [pushToast]);

  const pickSuggestion = useCallback((prompt) => {
    setComposer(prompt);
    const el = document.querySelector('textarea');
    if (el) el.focus();
  }, []);

  // ---- auth ----
  /**
   * `user` is the signed-in employee as the SERVER describes them, never as the client guesses.
   * `isAdmin` in particular decides whether admin-only sources appear in the chart builder, and
   * it has to be the backend's answer — a client-side role would let the picker offer a source
   * that 403s on resolve, which reads as a broken app rather than as a permission boundary.
   */
  const [user, setUser] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  /** Whether the backend is reachable. Screens use it to label sample data honestly. */
  const offline = useOffline();

  /**
   * Restore a session from the remembered token.
   *
   * `/me` is called rather than decoding the token client-side, because the role must come from
   * the server on every session — a token minted before a role change would otherwise keep the
   * old permissions alive in the UI until it expired.
   */
  useEffect(() => {
    if (!getToken()) return;
    let live = true;
    api.me()
      .then(({ user: u }) => { if (live) { setUser(u); setAuthed(true); setLanding(false); } })
      // An expired token is not an error worth showing: the client already cleared it on the
      // 401, so falling through to the sign-in screen is the correct outcome.
      .catch(() => {});
    return () => { live = false; };
  }, []);

  /** The seeded demo accounts, offered on the sign-in screen. Empty when the API is down. */
  const [demoUsers, setDemoUsers] = useState([]);
  useEffect(() => {
    api.demoUsers().then(({ users }) => setDemoUsers(users)).catch(() => setDemoUsers([]));
  }, []);

  /**
   * Sign in. There is no password check — see the note at the top of
   * backend/functions/neuiq_api/src/middleware/index.js.
   *
   * With the API down it still lets you in, as a clearly local session, because the alternative
   * is a demo that cannot be opened at all when only the frontend is running.
   */
  const doAuth = useCallback(async (username = 'alex') => {
    setAuthBusy(true); setAuthError('');
    try {
      const { token, user: u } = await api.login(String(username).trim().toLowerCase() || 'alex');
      setToken(token);
      setUser(u);
      setAuthed(true);
    } catch (err) {
      if (err instanceof ApiError && err.offline) {
        setUser({ name: CONFIG.greetingName, username: 'demo', role: 'employee', isAdmin: false, offline: true });
        setAuthed(true);
        pushToast('Signed in locally — API offline');
      } else {
        setAuthError(err.message);
      }
    } finally {
      setAuthBusy(false);
    }
  }, [pushToast]);

  const enterAuth = useCallback((v) => { setLanding(false); setAuthView(v); }, []);
  const toggleAuthView = useCallback(() => setAuthView((a) => (a === 'signup' ? 'login' : 'signup')), []);
  const logout = useCallback(() => {
    clearTimers();
    // Drop the token first. Anything still in flight then fails closed rather than resolving
    // into a signed-out UI with the previous account's data in it.
    setToken(null);
    setUser(null); setAuthError('');
    setLanding(true); setAuthed(false); setAuthView('login'); navigate(pathFor('empty'));
    setIncognito(false); setMessages([]); setComposer(''); setStreaming(false); setThinking(false); setStreamText('');
  }, [navigate]);

  // ---- row menu / density / prefs ----
  const openRowMenu = useCallback((key) => setRowMenu((cur) => (cur === key ? null : key)), []);
  const closeRowMenu = useCallback(() => setRowMenu(null), []);
  const toggleDensity = useCallback(() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact')), []);
  const togglePref = useCallback((key) => setPrefs((p) => ({ ...p, [key]: !p[key] })), []);

  // ---- sidebar resize ----
  const startResize = useCallback((e) => {
    e.preventDefault();
    const aside = e.currentTarget.parentElement;
    const left = aside.getBoundingClientRect().left;
    setResizing(true);
    const move = (ev) => { let w = ev.clientX - left; w = Math.max(220, Math.min(440, w)); setSidebarWidth(w); };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.userSelect = '';
      setResizing(false);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.body.style.userSelect = 'none';
  }, []);

  const openSearch = useCallback(() => pushToast('Search \u2014 \u2318K'), [pushToast]);

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); newChat(); }
      else if (meta && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openSearch(); }
      else if (meta && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); toggleSidebar(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newChat, openSearch, toggleSidebar]);

  useEffect(() => () => clearTimers(), []);

  const greeting = (() => {
    if (incognito) return "You're in a private chat";
    const h = new Date().getHours();
    const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    // The signed-in employee's own first name once we have it, so the greeting matches whoever
    // actually authenticated rather than the demo default.
    const who = user?.name?.split(' ')[0] || CONFIG.greetingName;
    return `Good ${part}, ${who}`;
  })();

  const value = {
    // state
    uiStyle, theme, accent, view, collapsed, incognito, composer, thinking, streaming, streamText, messages,
    settingsTab, projTab, pgTab, histFilter, toasts, landing, authed, authView, density,
    rowMenu, sidebarWidth, resizing, prefs, greeting,
    // backend session
    user, authBusy, authError, demoUsers, offline,
    // setters used directly by screens
    setSettingsTab, setProjTab, setPgTab, setHistFilter, setTheme, setAccent, setComposer, setUiStyle,
    // actions
    pushToast, toast, go, newChat, toggleSidebar, toggleIncognito, loadConvo, cycleTheme, themeLabel,
    send, stop, sendOrStop, pinAnswer, pickSuggestion, doAuth, enterAuth, toggleAuthView, logout,
    openRowMenu, closeRowMenu, toggleDensity, togglePref, startResize, openSearch, scrollBottom,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
