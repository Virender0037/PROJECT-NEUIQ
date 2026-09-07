import { useEffect } from 'react';
import { useApp } from '@shared/context/AppContext.jsx';
import { applyTheme } from '@shared/lib/theme.js';
import './styles/theme.css';
import Sidebar from './components/Sidebar.jsx';
import TopControls from './components/TopControls.jsx';
import Composer from './components/Composer.jsx';
import Toasts from './components/Toasts.jsx';

import EmptyState from './pages/EmptyState.jsx';
import Conversation from './pages/Conversation.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CustomDashboard from './pages/CustomDashboard.jsx';
import Ai from './pages/Ai.jsx';
import ProjectsGrid from './pages/ProjectsGrid.jsx';
import ProjectWorkspace from './pages/ProjectWorkspace.jsx';
import History from './pages/History.jsx';
import Tasks from './pages/Tasks.jsx';
import Settings from './pages/Settings.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';

/**
 * Views Hybrid splits across three analytics tabs. Classic renders its one dashboard screen for
 * all of them — the same saved dashboards, built the same way, in this style's chrome.
 *
 * `ai` is NOT in this list: it has its own screen here, because "what can the assistant reach"
 * is a different question from "show me my charts" and answering it with a chart grid is how a
 * user concludes the assistant has no stated limits.
 */
const ANALYTICS = ['custom', 'reports', 'builder'];

/**
 * ClassicUI — the original prototype shell: fixed sidebar + main column, with
 * theme and view switching. Marketing/auth gate overlays until signed in.
 */
export default function ClassicUI() {
  const app = useApp();
  const { view, theme, accent } = app;

  // One place writes the theme attributes, and it hands them back on unmount so the next UI
  // style is not left wearing tokens its stylesheet never defined.
  useEffect(() => applyTheme(theme, accent), [theme, accent]);

  // `empty` and `chat` were never two destinations - only "does this conversation have
  // messages yet". With the URL owning `view`, that is decided here from messages.length.
  const isChatLike = view === 'chat' || view === 'incognito';
  const showEmpty = isChatLike && app.messages.length === 0;
  const showConvo = isChatLike && app.messages.length > 0;

  return (
    <div
      data-om-density={app.density}
      style={{
        height: '100vh', width: '100%', display: 'flex', overflow: 'hidden',
        background: 'var(--wall)', color: 'var(--text)', fontSize: 14,
      }}
    >
      <Sidebar />

      <main style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--app-bg)', position: 'relative' }}>
        <TopControls />

        <div data-nr-scroll="1" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', position: 'relative', paddingTop: 48 }}>
          {/* keyed on the view so the enter animation replays on navigation, not only on mount */}
          <div className="nr-view" key={view}>
          {showEmpty && <EmptyState />}
          {showConvo && <Conversation />}
          {view === 'dashboard' && <Dashboard />}
          {/* Analytics is three routes in Hybrid; Classic has only the one custom-widget grid,
              so all three land there rather than on a blank pane. */}
          {ANALYTICS.includes(view) && <CustomDashboard />}
          {view === 'ai' && <Ai />}
          {view === 'projects' && <ProjectsGrid />}
          {view === 'project' && <ProjectWorkspace />}
          {view === 'history' && <History />}
          {view === 'tasks' && <Tasks />}
          {view === 'settings' && <Settings />}
          </div>
        </div>

        {isChatLike && <Composer />}
        <Toasts />
      </main>

      {app.landing && <Landing />}
      {!app.authed && !app.landing && <Auth />}
    </div>
  );
}
