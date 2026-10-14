import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';

/**
 * One screen for the three ways of looking at the same numbers.
 *
 * Reports, Chart Builder and AI Dashboards were heading for three dock rows doing one job:
 * Reports is the fixed view, Chart Builder is the same data by hand, AI Dashboards is the same
 * data by description. Three rows for that is three decisions before you have looked at anything.
 *
 * They stay three ROUTES — deep links keep working and the assistant can open any of them by
 * name — but they share a shell, so switching is a tab rather than a trip back out to the dock.
 */
const TABS = [
  { view: 'reports', label: 'Reports', icon: 'activity', hint: 'Every report in the workspace — standard, built by hand, or built by AI' },
  { view: 'builder', label: 'Chart Builder', icon: 'sliders', hint: 'Pick a source, a grouping and a chart type over your people data' },
  { view: 'custom', label: 'AI Dashboards', icon: 'sparkles', hint: 'Describe a dashboard; it is built from the data your account may read' },
];

export default function AnalyticsTabs({ active, actions, children }) {
  const app = useApp();
  const current = TABS.find((t) => t.view === active);

  return (
    <div className="view an-view">
      <div className="an-bar">
        <nav className="an-tabs" aria-label="Analytics views">
          {TABS.map(({ view, label, icon }) => (
            <button
              key={view}
              className={'an-tab' + (view === active ? ' on' : '')}
              aria-current={view === active ? 'page' : undefined}
              onClick={() => app.go(view)}
            >
              <Icon name={icon} size={14} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        {/* The strapline follows the tab rather than each page carrying its own heading — the
            shell already names the screen, and three of them would say it twice. */}
        {current && <p className="an-hint">{current.hint}</p>}
        {actions && <div className="an-acts">{actions}</div>}
      </div>

      <div className="an-body">{children}</div>
    </div>
  );
}
