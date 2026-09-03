import { useApp, CONFIG } from './context/AppContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopControls from './components/TopControls.jsx';
import Composer from './components/Composer.jsx';
import Toasts from './components/Toasts.jsx';

import EmptyState from './pages/EmptyState.jsx';
import Conversation from './pages/Conversation.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CustomDashboard from './pages/CustomDashboard.jsx';
import ProjectsGrid from './pages/ProjectsGrid.jsx';
import ProjectWorkspace from './pages/ProjectWorkspace.jsx';
import History from './pages/History.jsx';
import Tasks from './pages/Tasks.jsx';
import Settings from './pages/Settings.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';

/**
 * App — wires theme + view switching around the fixed sidebar and main column.
 * Renders the marketing/auth gate as a full-screen overlay until signed in.
 */
export default function App() {
  const app = useApp();
  const { view, theme, incognito } = app;

  const isChatLike = view === 'chat' || view === 'empty' || view === 'incognito';
  const showEmpty = view === 'empty' || (view === 'incognito' && app.messages.length === 0);
  const showConvo = (view === 'chat' || view === 'incognito') && app.messages.length > 0;

  return (
    <div
      data-theme={theme}
      data-om-density={app.density}
      style={{
        height: '100vh', width: '100%', display: 'flex', overflow: 'hidden',
        background: 'var(--wall)', color: 'var(--text)', fontSize: 14,
        ...(CONFIG.accent && String(CONFIG.accent).charAt(0) === '#' ? { '--accent': CONFIG.accent } : {}),
      }}
    >
      <Sidebar />

      <main style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--app-bg)', position: 'relative' }}>
        <TopControls />

        <div data-nr-scroll="1" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', position: 'relative', paddingTop: 48 }}>
          {showEmpty && <EmptyState />}
          {showConvo && <Conversation />}
          {view === 'dashboard' && <Dashboard />}
          {view === 'custom' && <CustomDashboard />}
          {view === 'projects' && <ProjectsGrid />}
          {view === 'project' && <ProjectWorkspace />}
          {view === 'history' && <History />}
          {view === 'tasks' && <Tasks />}
          {view === 'settings' && <Settings />}
        </div>

        {isChatLike && <Composer />}
        <Toasts />
      </main>

      {app.landing && <Landing />}
      {!app.authed && !app.landing && <Auth />}
    </div>
  );
}
