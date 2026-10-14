import { useEffect, useState } from 'react';
import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import AnalyticsTabs from '../components/AnalyticsTabs.jsx';
import Widget from '../components/Widget.jsx';
import { buildDashboard, cleanWidgets, SUGGESTIONS } from '@shared/dashboards';
import { useDashboards } from '@shared/dashboards/useDashboards.js';
import { CONNECTION, actionFailedMessage, errorState } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * AI Dashboards — describe what you want, the server turns it into a widget spec against the
 * read-only query engine, you preview it, then save.
 *
 * The preview renders live widgets before saving, so a bad spec shows up as an empty chart here
 * rather than being discovered after it is in your list.
 */
function BuildModal({ open, onClose, onSaved }) {
  // Provenance from what the backend reports (shared/lib/dataSource.js), never assumed "live".
  const { dataInfo } = useApp();
  const [prompt, setPrompt] = useState('');
  const [spec, setSpec] = useState(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [saving, setSaving] = useState(false);

  // A reopened modal should not still be showing the last build.
  useEffect(() => {
    if (open) { setPrompt(''); setSpec(null); setTitle(''); setBusy(false); setFailed(''); setSaving(false); }
  }, [open]);

  /** POST /dashboards/build. Nothing is saved yet — the spec comes back and you preview it. */
  const run = async (text) => {
    const p = (text ?? prompt).trim();
    if (!p || busy) return;
    setBusy(true); setFailed(''); setSpec(null);
    try {
      const res = await buildDashboard(p);
      setSpec(res);
      setTitle(res.title || p.slice(0, 48));
    } catch (err) {
      // The server's reason — or, with the server unreachable, that it could not be reached.
      // There is no offline builder any more (Phase 4): it was not scope-aware, and could hand
      // an employee an admin-only widget to preview.
      setFailed(actionFailedMessage(err, CONNECTION.buildFailed));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!spec?.widgets?.length || saving) return;
    setSaving(true);
    try {
      await onSaved({
        title: title.trim() || spec.title || 'Dashboard',
        // Re-whitelisted on the way out, exactly as the server does again on arrival.
        widgets: cleanWidgets(spec.widgets),
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal ai-dash-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2><Icon name="sparkles" size={18} /> Build a dashboard with AI</h2>
            <p>{dataInfo.builds}</p>
          </div>
          <button className="modal-close" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div className="modal-body">
          <div className="adb-prompt">
            <textarea
              rows={2}
              value={prompt}
              aria-label="Describe the dashboard"
              placeholder="e.g. leave by type and status, and average hours by month"
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }}
            />
            <button className="btn primary" onClick={() => run()} disabled={busy || !prompt.trim()}>
              {busy ? <span className="btn-spin" /> : <Icon name="sparkles" size={16} />}
              {busy ? 'Building…' : 'Build'}
            </button>
          </div>

          {failed && <div className="adb-error" role="alert">{failed}</div>}

          {!spec && !failed && (
            <div className="adb-suggest">
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => { setPrompt(s); run(s); }}>{s}</button>)}
            </div>
          )}

          {spec && (spec.widgets.length ? (
            <div className="adb-preview">
              <div className="adb-preview-head">
                <input
                  className="adb-title"
                  value={title}
                  aria-label="Dashboard name"
                  placeholder="Dashboard name"
                  onChange={(e) => setTitle(e.target.value)}
                />
                {/* Say where the spec came from: the keyword fallback is a fine dashboard but it
                    is not the model's work, and passing it off as such is how you stop trusting
                    either one. */}
                <span className="adb-src">
                  {spec.source === 'fallback' ? 'built from keywords'
                    : spec.source ? 'via ' + spec.source
                    : 'source not reported'}
                </span>
              </div>
              <div className="dw-grid">{spec.widgets.map((w, i) => <Widget key={i} widget={w} />)}</div>
            </div>
          ) : (
            <div className="dw-empty" style={{ padding: 30 }}>
              Couldn't build that — try naming leave, attendance, status, month or department.
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!spec?.widgets?.length || saving} onClick={save}>
            {saving ? <span className="btn-spin" /> : <Icon name="check" size={16} />}
            {saving ? 'Saving…' : 'Save dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AiDashboards() {
  const app = useApp();
  const dash = useDashboards();
  const { list } = dash;
  const [activeId, setActiveId] = useState(null);
  const [buildOpen, setBuildOpen] = useState(false);
  const [renaming, setRenaming] = useState(null);

  /**
   * Which dashboard is open.
   *
   * `activeId` starts null and the first row stands in until something is picked, rather than
   * being seeded in state — the list arrives asynchronously, so an id chosen at mount would
   * either be from the wrong list or force an effect that fights the user's own selection.
   * Deleting the open one falls back to whatever is left instead of showing the blank slate.
   */
  const active = list.find((d) => d.id === activeId) || list[0] || null;

  /** Every action reports what happened, including a refusal — a click that changes nothing and
   *  says nothing is indistinguishable from a broken button. */
  const attempt = async (fn, done) => {
    try { const r = await fn(); app.pushToast(done); return r; }
    // A change the server did not confirm says so. "Dashboard saved." used to appear for edits
    // held only in browser memory while the API was down.
    catch (err) { app.pushToast(actionFailedMessage(err)); return null; }
  };

  const onSaved = async (spec) => {
    const row = await attempt(() => dash.create(spec), 'Dashboard saved.');
    if (row) { setActiveId(row.id); setBuildOpen(false); }
  };

  const rename = async (id, next) => {
    setRenaming(null);
    if (next.trim()) await attempt(() => dash.rename(id, next), 'Renamed.');
  };

  const duplicate = async (d) => {
    const copy = await attempt(() => dash.duplicate(d), 'Duplicated.');
    if (copy) setActiveId(copy.id);
  };

  const remove = async (d) => {
    await attempt(() => dash.remove(d), 'Deleted.');
    setActiveId((id) => (id === d.id ? null : id));
  };

  return (
    <AnalyticsTabs
      active="custom"
      actions={
        <>
          <button className="btn primary" onClick={() => setBuildOpen(true)}>
            <Icon name="sparkles" size={15} />New with AI
          </button>
        </>
      }
    >
      {list.length > 0 && (
        <div className="adb-tabs" role="tablist" aria-label="Saved dashboards">
          {list.map((d) => (
            <span key={d.id} className={'adb-tab-wrap' + (d.id === active?.id ? ' on' : '')}>
              {renaming === d.id ? (
                <input
                  className="adb-tab adb-title"
                  autoFocus
                  defaultValue={d.title}
                  aria-label={'Rename ' + d.title}
                  onBlur={(e) => rename(d.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename(d.id, e.currentTarget.value);
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button
                  className={'adb-tab' + (d.id === active?.id ? ' on' : '')}
                  role="tab"
                  aria-selected={d.id === active?.id}
                  title={d.title + ' (double-click to rename)'}
                  onClick={() => setActiveId(d.id)}
                  onDoubleClick={() => setRenaming(d.id)}
                >
                  {d.title}
                </button>
              )}
              <span className="adb-tab-acts">
                <button className="adb-tab-act" onClick={() => setRenaming(d.id)} aria-label={'Rename ' + d.title}>
                  <Icon name="sliders" size={11} />
                </button>
                <button className="adb-tab-act" onClick={() => duplicate(d)} aria-label={'Duplicate ' + d.title}>
                  <Icon name="copy" size={11} />
                </button>
                <button className="adb-tab-act danger" onClick={() => remove(d)} aria-label={'Delete ' + d.title}>
                  <Icon name="x" size={11} />
                </button>
              </span>
            </span>
          ))}
        </div>
      )}

      {dash.loading ? (
        <div className="dw-grid">{[0, 1, 2].map((i) => <div className="dw-card" key={i}><div className="dw-skel" /></div>)}</div>
      ) : dash.error ? (
        // Unreachable or refused: never "No dashboards yet", which would claim there are none.
        <EmptyPanel state={errorState(dash.error)} />
      ) : active ? (
        <div className="dw-grid">{active.widgets.map((w, i) => <Widget key={i} widget={w} />)}</div>
      ) : (
        <div className="adb-blank">
          <Icon name="sparkles" size={34} />
          <h3>No dashboards yet</h3>
          <p>Click <strong>New with AI</strong> and describe what you want to see.</p>
          <button className="btn primary" onClick={() => setBuildOpen(true)}>
            <Icon name="plus" size={16} />Build your first
          </button>
        </div>
      )}

      <BuildModal open={buildOpen} onClose={() => setBuildOpen(false)} onSaved={onSaved} />
    </AnalyticsTabs>
  );
}
