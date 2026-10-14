import { useState } from 'react';
import { useApp } from '@shared/context/AppContext.jsx';
import { CONNECTION, actionFailedMessage, errorState } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';
import El from '@shared/components/El.jsx';
import Icon from '@shared/icons/Icon.jsx';
import Widget from '../components/Widget.jsx';
import { useDashboards } from '@shared/dashboards/useDashboards.js';
import { buildDashboard, cleanWidgets, SUGGESTIONS } from '@shared/dashboards';

/**
 * CustomDashboard — Classic's on-demand dashboards.
 *
 * The same feature as Hybrid's AI Dashboards, in Classic's chrome: describe what you want, the
 * server turns it into a widget spec against the read-only query engine, you preview it, then
 * save. Both screens call `useDashboards()` and render `<Widget>`, so a dashboard saved in one
 * style opens in the other — they are two views of one list, not two lists.
 *
 * The widgets themselves store the QUESTION, never the answer, and re-resolve against your own
 * permissions on every read. See docs/backend/15-dashboards.md.
 */
const BTN = "display:flex;align-items:center;gap:7px;height:34px;padding:0 12px;border:var(--border-w) solid var(--border-strong);background:var(--surface);color:var(--text);border-radius:9px;cursor:pointer;font-family:'Inter Tight';font-size:13px;font-weight:500";
const BTN_PRIMARY = "display:flex;align-items:center;gap:7px;height:34px;padding:0 13px;border:none;background:var(--accent);color:var(--accent-fg);border-radius:9px;cursor:pointer;font-family:'Inter Tight';font-size:13px;font-weight:600";

/** Describe a dashboard, preview it live, then save. Nothing is stored until you do. */
function BuildPanel({ onSaved, onCancel }) {
  // Provenance from what the backend reports (shared/lib/dataSource.js), never assumed "live".
  const { dataInfo } = useApp();
  const [prompt, setPrompt] = useState('');
  const [spec, setSpec] = useState(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [saving, setSaving] = useState(false);

  const run = async (text) => {
    const p = (text ?? prompt).trim();
    if (!p || busy) return;
    setBusy(true); setFailed(''); setSpec(null);
    try {
      const res = await buildDashboard(p);
      setSpec(res);
      setTitle(res.title || p.slice(0, 48));
    } catch (err) {
      // The server's own reason, not a paraphrase — or, with the server unreachable, that it
      // could not be reached. There is no offline builder any more (Phase 4): it was not
      // scope-aware, and a dashboard built from nothing is not one to preview.
      setFailed(actionFailedMessage(err, CONNECTION.buildFailed));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!spec?.widgets?.length || saving) return;
    setSaving(true);
    try {
      // Re-whitelisted on the way out, exactly as the server does again on arrival.
      await onSaved({ title: title.trim() || spec.title || 'Dashboard', widgets: cleanWidgets(spec.widgets) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
        <Icon name="sparkles" size={16} />Build a dashboard
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', margin: '0 0 12px' }}>
        {dataInfo.builds}
      </p>

      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <El
          as="textarea"
          rows={2}
          value={prompt}
          aria-label="Describe the dashboard"
          placeholder="e.g. leave by type and status, and average hours by month"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }}
          css="flex:1;min-width:0;padding:9px 11px;border:var(--border-w) solid var(--border-strong);background:var(--app-bg);color:var(--text);border-radius:9px;font-size:13.5px;font-family:'Inter Tight';resize:vertical;outline:none"
          focus="border-color:var(--accent);box-shadow:0 0 0 3px var(--ring)"
        />
        <El as="button" onClick={() => run()} disabled={busy || !prompt.trim()} css={BTN_PRIMARY} hover="filter:brightness(1.06)">
          <Icon name="sparkles" size={15} />{busy ? 'Building…' : 'Build'}
        </El>
      </div>

      {failed && (
        <div role="alert" style={{ marginTop: 11, fontSize: 12.5, color: 'var(--red)', lineHeight: 1.45 }}>{failed}</div>
      )}

      {!spec && !failed && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
          {SUGGESTIONS.map((s) => (
            <El key={s} as="button" onClick={() => { setPrompt(s); run(s); }}
              css="padding:6px 11px;border:var(--border-w) solid var(--border);background:transparent;color:var(--text-muted);border-radius:999px;font-size:12.5px;cursor:pointer;font-family:'Inter Tight';text-align:left"
              hover="background:var(--hover);color:var(--text)">{s}</El>
          ))}
        </div>
      )}

      {spec && (spec.widgets.length ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <El as="input" value={title} aria-label="Dashboard name" placeholder="Dashboard name"
              onChange={(e) => setTitle(e.target.value)}
              css="flex:1;min-width:0;height:34px;padding:0 11px;border:var(--border-w) solid var(--border-strong);background:var(--app-bg);color:var(--text);border-radius:9px;font-size:13.5px;font-weight:600;font-family:'Inter Tight';outline:none"
              focus="border-color:var(--accent);box-shadow:0 0 0 3px var(--ring)" />
            {/* Say where the spec came from: the keyword fallback makes a fine dashboard but it
                is not the model's work, and passing one off as the other is how people stop
                trusting both. */}
            <span style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>
              {spec.source === 'fallback' ? 'built from keywords'
                : spec.source ? 'via ' + spec.source
                : 'source not reported'}
            </span>
          </div>
          {/* Live widgets before saving, so a bad spec shows up as an empty chart here rather
              than being discovered after it is in your list. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {spec.widgets.map((w, i) => <Widget key={i} widget={w} />)}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-subtle)', padding: '16px 0' }}>
          Couldn&apos;t build that — try naming leave, attendance, status, month or department.
        </div>
      ))}

      <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
        <span style={{ flex: 1 }} />
        <El as="button" onClick={onCancel} css={BTN} hover="background:var(--hover)">Cancel</El>
        <El as="button" onClick={save} disabled={!spec?.widgets?.length || saving} css={BTN_PRIMARY} hover="filter:brightness(1.06)">
          <Icon name="check" size={15} />{saving ? 'Saving…' : 'Save dashboard'}
        </El>
      </div>
    </div>
  );
}

export default function CustomDashboard() {
  const app = useApp();
  const dash = useDashboards();
  const { list } = dash;
  const [activeId, setActiveId] = useState(null);
  const [building, setBuilding] = useState(false);

  /**
   * Which dashboard is open.
   *
   * `activeId` starts null and the first row stands in until something is picked, rather than
   * being seeded in state — the list arrives asynchronously, so an id chosen at mount would
   * either be from the wrong list or need an effect that fights the user's own selection.
   */
  const active = list.find((d) => d.id === activeId) || list[0] || null;

  /** Every action reports what happened, refusals included — a click that changes nothing and
   *  says nothing is indistinguishable from a broken button. */
  const attempt = async (fn, done) => {
    try { const r = await fn(); app.pushToast(done); return r; }
    // A change the server did not confirm says so. "Dashboard saved." used to appear for edits
    // held only in browser memory while the API was down.
    catch (err) { app.pushToast(actionFailedMessage(err)); return null; }
  };

  const onSaved = async (spec) => {
    const row = await attempt(() => dash.create(spec), 'Dashboard saved.');
    if (row) { setActiveId(row.id); setBuilding(false); }
  };

  const remove = async (d) => {
    await attempt(() => dash.remove(d), 'Deleted.');
    setActiveId((id) => (id === d.id ? null : id));
  };

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '6px 26px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-subtle)' }}>
          Widgets store the question, not the answer — every figure is re-fetched and re-scoped
          to you when this opens.
        </div>
        {!building && (
          <El as="button" onClick={() => setBuilding(true)} css={BTN_PRIMARY} hover="filter:brightness(1.06)">
            <Icon name="sparkles" size={16} />New with AI
          </El>
        )}
      </div>

      {building && <BuildPanel onSaved={onSaved} onCancel={() => setBuilding(false)} />}

      {list.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }} role="tablist" aria-label="Saved dashboards">
          {list.map((d) => {
            const on = d.id === active?.id;
            return (
              <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <El as="button" role="tab" aria-selected={on} onClick={() => setActiveId(d.id)}
                  css={`padding:6px 12px;border:var(--border-w) solid ${on ? 'var(--accent)' : 'var(--border)'};background:${on ? 'var(--chip)' : 'transparent'};color:${on ? 'var(--text)' : 'var(--text-muted)'};border-radius:999px 0 0 999px;font-size:12.5px;font-weight:${on ? 600 : 500};cursor:pointer;font-family:'Inter Tight'`}
                  hover="background:var(--hover);color:var(--text)">{d.title}</El>
                <El as="button" onClick={() => remove(d)} aria-label={'Delete ' + d.title} title={'Delete ' + d.title}
                  css={`display:flex;align-items:center;padding:7px 9px;border:var(--border-w) solid ${on ? 'var(--accent)' : 'var(--border)'};border-left:none;background:transparent;color:var(--text-subtle);border-radius:0 999px 999px 0;cursor:pointer`}
                  hover="background:var(--hover);color:var(--red)"><Icon name="x" size={12} /></El>
              </span>
            );
          })}
        </div>
      )}

      {dash.loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: 16 }}>
              <div className="nr-skel" style={{ height: 150 }} />
            </div>
          ))}
        </div>
      ) : dash.error ? (
        // Unreachable or refused: never "No dashboards yet", which would claim there are none.
        <EmptyPanel state={errorState(dash.error)} />
      ) : active ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {active.widgets.map((w, i) => <Widget key={i} widget={w} />)}
        </div>
      ) : !building ? (
        <El as="button" onClick={() => setBuilding(true)}
          css="width:100%;border:var(--border-w) dashed var(--border-strong);background:transparent;border-radius:14px;padding:34px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;color:var(--text-subtle);font-family:'Inter Tight'"
          hover="background:var(--hover);color:var(--text)">
          <Icon name="sparkles" size={24} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>No dashboards yet</span>
          <span style={{ fontSize: 12.5 }}>Describe what you want to see and it gets built.</span>
        </El>
      ) : null}
    </div>
  );
}
