import { useEffect, useState } from 'react';
import { useApp } from '@shared/context/AppContext.jsx';
import './styles/global.css';
import './styles/neuiq.css';   // NeuIQ-only additions, loaded after the design system
import GridBackground from './components/GridBackground.jsx';
import Dock from './components/Dock.jsx';
import TopBar from './components/TopBar.jsx';
import DataSourceBanner from './components/DataSourceBanner.jsx';
import Composer from './components/Composer.jsx';
import Toasts from './components/Toasts.jsx';
import { applyTheme } from '@shared/lib/theme.js';

import EmptyState from './pages/EmptyState.jsx';
import Conversation from './pages/Conversation.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Reports from './pages/Reports.jsx';
import ChartBuilder from './pages/ChartBuilder.jsx';
import AiDashboards from './pages/AiDashboards.jsx';
import Ai from './pages/Ai.jsx';
import ProjectsGrid from './pages/ProjectsGrid.jsx';
import ProjectWorkspace from './pages/ProjectWorkspace.jsx';
import History from './pages/History.jsx';
import Tasks from './pages/Tasks.jsx';
import Settings from './pages/Settings.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';

/** The analytics tabs share one dock row - they are three views of the same numbers. */
const ANALYTICS = ['reports', 'builder', 'custom'];

const ls = (k, fallback) => { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/**
 * HybridUI — a data-workspace shell: floating dock on the left, main container on the right,
 * both inset from the window edges and from each other so neither touches anything.
 *
 * Owns its own appearance state. Seven themes ride on two axes — `data-theme` picks the
 * component rules, `data-variant` re-tints the base tokens — so dim, mono-dark and aqua-dark
 * reuse every dark rule instead of duplicating them. Kept local rather than pushed into shared
 * state because Classic only knows light/dark, and flattening this to fit would lose five themes.
 */
export default function HybridUI() {
  const app = useApp();
  const { view } = app;

  // Theme and accent are SHARED with every other UI style - see shared/lib/theme.js. Only the
  // dock's own geometry is local, because no other style has a dock.
  const { theme, accent } = app;
  const [dockMini, setDockMini] = useState(() => ls('neuiq_hy_dock', 'full') === 'mini');
  const [dockW, setDockW] = useState(() => Number(ls('neuiq_hy_dockw', '232')) || 232);

  // One place writes the theme attributes, and it hands them back on unmount so the next UI
  // style is not left wearing tokens its stylesheet never defined.
  useEffect(() => applyTheme(theme, accent), [theme, accent]);

  useEffect(() => { save('neuiq_hy_dock', dockMini ? 'mini' : 'full'); }, [dockMini]);
  useEffect(() => { save('neuiq_hy_dockw', String(dockW)); }, [dockW]);

  const isChatLike = view === 'chat' || view === 'incognito';
  const showEmpty = isChatLike && app.messages.length === 0;
  const showConvo = isChatLike && app.messages.length > 0;

  if (app.landing) return (<><GridBackground /><Landing /></>);
  if (!app.authed) return (<><GridBackground /><Auth /></>);

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <GridBackground />
      <div className="shell" style={{ '--dock-w': dockW + 'px' }}>
        <Dock active={ANALYTICS.includes(view) ? 'reports' : view} onNavigate={app.go}
          collapsed={dockMini} onToggle={() => setDockMini(v => !v)}
          width={dockW} onResize={setDockW} />

        <div className="app-scroll">
          <TopBar view={view} />
          <DataSourceBanner />
          <main id="main" className="page" tabIndex={-1}>
            {/* keyed on the view so the enter animation replays on every navigation */}
            <div className="route-view" key={view}>
              {showEmpty && <EmptyState />}
              {showConvo && <Conversation />}
              {view === 'dashboard' && <Dashboard />}
              {view === 'reports' && <Reports />}
              {view === 'builder' && <ChartBuilder />}
              {view === 'custom' && <AiDashboards />}
              {view === 'ai' && <Ai />}
              {view === 'projects' && <ProjectsGrid />}
              {view === 'project' && <ProjectWorkspace />}
              {view === 'history' && <History />}
              {view === 'tasks' && <Tasks />}
              {view === 'settings' && <Settings />}
            </div>
          </main>
          {isChatLike && <Composer />}
        </div>
      </div>
      <Toasts />
    </>
  );
}
