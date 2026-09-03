import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { seedConversation, answerFor } from '../data/mockData.js';

/** App-wide defaults (were DC props). Change these to reconfigure the demo. */
export const CONFIG = {
  defaultTheme: 'light',   // 'light' | 'dark'
  accent: null,            // e.g. '#c15f3c' to override the theme accent; null = theme default
  greetingName: 'Alex',
  density: 'comfortable',  // 'comfortable' | 'compact'
};

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

let TOAST_ID = 0;

export function AppProvider({ children }) {
  // ---- core state (mirrors the original component) ----
  const [theme, setTheme] = useState(CONFIG.defaultTheme);
  const [view, setView] = useState('empty'); // empty | chat | incognito | dashboard | custom | projects | project | history | tasks | settings
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
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // Mirror a few values into refs so async callbacks read fresh state without
  // nesting cross-setter updates (avoids stale closures + React warnings).
  const composerRef = useRef('');
  const streamingRef = useRef(false);
  const incognitoRef = useRef(false);
  const streamTextRef = useRef('');
  composerRef.current = composer;
  streamingRef.current = streaming;
  incognitoRef.current = incognito;
  streamTextRef.current = streamText;

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
    setView(v);
    setIncognito((cur) => (v === 'incognito' ? true : v === 'chat' || v === 'empty' ? cur : false));
  }, []);

  const newChat = useCallback(() => {
    clearTimers();
    setView('empty'); setIncognito(false); setMessages([]);
    setThinking(false); setStreaming(false); setStreamText(''); setComposer('');
  }, []);

  const toggleSidebar = useCallback(() => setCollapsed((c) => !c), []);

  const toggleIncognito = useCallback(() => {
    setIncognito((inc) => {
      const next = !inc;
      setTheme(next ? 'dark' : CONFIG.defaultTheme);
      setView(next ? 'incognito' : 'empty');
      setMessages([]); setStreamText(''); setStreaming(false); setThinking(false);
      return next;
    });
  }, []);

  const loadConvo = useCallback(() => {
    clearTimers();
    setView('chat'); setIncognito(false); setMessages(seedConversation());
    setThinking(false); setStreaming(false); setStreamText(''); setComposer('');
    scrollBottom();
  }, [scrollBottom]);

  // ---- theme ----
  const themeLabel = (t) => ({ light: 'Light', dark: 'Dark' }[t] || t);
  const cycleTheme = useCallback(() => {
    setTheme((cur) => {
      const order = ['light', 'dark'];
      const next = order[(order.indexOf(cur) + 1) % order.length];
      pushToast('Theme: ' + themeLabel(next));
      return next;
    });
  }, [pushToast]);

  // ---- composer / streaming ----
  const finish = useCallback((full) => {
    const am = { id: 'a' + Date.now(), role: 'ai', blocks: [{ t: 'p', text: full }] };
    setMessages((m) => [...m, am]);
    setStreaming(false); setThinking(false); setStreamText('');
    scrollBottom();
  }, [scrollBottom]);

  const send = useCallback(() => {
    const trimmed = composerRef.current.trim();
    if (!trimmed || streamingRef.current) return;
    const um = { id: 'u' + Date.now(), role: 'user', text: trimmed };
    setMessages((m) => [...m, um]);
    setComposer('');
    setView(incognitoRef.current ? 'incognito' : 'chat');
    setThinking(true);
    setStreaming(true);
    setStreamText('');
    scrollBottom();
    const t1 = setTimeout(() => {
      setThinking(false);
      const full = answerFor(trimmed);
      let i = 0;
      const step = () => {
        i += Math.max(2, Math.round(full.length / 70));
        setStreamText(full.slice(0, i));
        scrollBottom();
        if (i < full.length) { const h = setTimeout(step, 22); timers.current.push(h); }
        else finish(full);
      };
      step();
    }, 950);
    timers.current.push(t1);
  }, [scrollBottom, finish]);

  const stop = useCallback(() => {
    clearTimers();
    const full = streamTextRef.current;
    if (full) finish(full);
    else { setStreaming(false); setThinking(false); }
  }, [finish]);

  const sendOrStop = useCallback(() => { if (streamingRef.current) stop(); else send(); }, [stop, send]);

  const pickSuggestion = useCallback((prompt) => {
    setComposer(prompt);
    const el = document.querySelector('textarea');
    if (el) el.focus();
  }, []);

  // ---- auth ----
  const doAuth = useCallback(() => setAuthed(true), []);
  const enterAuth = useCallback((v) => { setLanding(false); setAuthView(v); }, []);
  const toggleAuthView = useCallback(() => setAuthView((a) => (a === 'signup' ? 'login' : 'signup')), []);
  const logout = useCallback(() => {
    clearTimers();
    setLanding(true); setAuthed(false); setAuthView('login'); setView('empty');
    setIncognito(false); setMessages([]); setComposer(''); setStreaming(false); setThinking(false); setStreamText('');
  }, []);

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
    return `Good ${part}, ${CONFIG.greetingName}`;
  })();

  const value = {
    // state
    theme, view, collapsed, incognito, composer, thinking, streaming, streamText, messages,
    settingsTab, projTab, pgTab, histFilter, toasts, landing, authed, authView, density,
    rowMenu, sidebarWidth, resizing, prefs, greeting,
    // setters used directly by screens
    setSettingsTab, setProjTab, setPgTab, setHistFilter, setTheme, setComposer,
    // actions
    pushToast, toast, go, newChat, toggleSidebar, toggleIncognito, loadConvo, cycleTheme, themeLabel,
    send, stop, sendOrStop, pickSuggestion, doAuth, enterAuth, toggleAuthView, logout,
    openRowMenu, closeRowMenu, toggleDensity, togglePref, startResize, openSearch, scrollBottom,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
