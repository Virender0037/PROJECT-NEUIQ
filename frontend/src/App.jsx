import { lazy, Suspense } from 'react';
import { useApp } from '@shared/context/AppContext.jsx';
import UiSwitching from '@shared/components/UiSwitching.jsx';
import { UI_STYLES as STYLE_META } from '@shared/data/appearance.js';

/**
 * App — selects which UI style renders the workspace.
 *
 * Each style owns its own shell, presentation components and stylesheet; all of them read the
 * same state from <AppProvider> and the same `view` derived from the URL.
 *
 * The imports are lazy for CORRECTNESS, not bundle size. A style's stylesheet loads with its
 * chunk, and Hybrid's is a global sheet that styles bare `html`, `body` and `table`. Imported
 * statically it would restyle Classic too, whichever style was actually mounted. If you ever
 * convert these back to static imports, Classic silently inherits Hybrid's typography.
 *
 * The Suspense fallback is a real screen rather than `null`. During the swap the outgoing
 * stylesheet has already unloaded and the incoming chunk has not arrived, so `null` shows an
 * unstyled white page — which in a dark session looks exactly like a crash.
 */
const UI_STYLES = {
  classic: lazy(() => import('@ui/classic/index.jsx')),
  hybrid: lazy(() => import('@ui/hybrid/index.jsx')),
  modern: lazy(() => import('@ui/modern/index.jsx')),
};

export default function App() {
  const { uiStyle, theme } = useApp();
  const Chosen = UI_STYLES[uiStyle] || UI_STYLES.classic;
  const label = STYLE_META.find((s) => s.id === uiStyle)?.label || 'NeuIQ';

  return (
    <Suspense fallback={<UiSwitching to={label} theme={theme} />}>
      <Chosen />
    </Suspense>
  );
}
