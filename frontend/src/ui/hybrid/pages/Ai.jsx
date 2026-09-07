import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import Logo from '@shared/icons/Logo.jsx';
import { useApi, api } from '@shared/api';
import { SOURCES, schemaFor } from '@shared/dashboards';
import { SEED_AI_ACTIVITY } from '@shared/data/seedDashboards.js';

/**
 * AI — what the assistant can actually do, stated plainly.
 *
 * This exists because "ask me anything" is a lie in an enterprise assistant: it can reach exactly
 * the tools it has been given, over exactly the data the caller is allowed to see. Showing that
 * up front is the difference between a user trusting an answer and second-guessing every one.
 */

/**
 * Icons for the tool cards.
 *
 * Only the icons live here. The tool list itself comes from GET /ai/capabilities, because this
 * screen's entire claim is "here is exactly what the assistant can reach" — and a hardcoded list
 * makes that claim about the code as it was written rather than about the server as it is now.
 * The two would drift, and the screen that promises the allow-list is the worst place for that.
 */
const TOOL_ICONS = {
  'zohoPeople.leaveBalance': 'checkCircle',
  'zohoPeople.leaveRecords': 'file',
  'zohoPeople.attendanceSummary': 'clock',
  'zohoPeople.teamOnLeave': 'user',
  'zohoPeople.headcount': 'layoutGrid',
  'zohoPeople.employeeLookup': 'search',
};

/**
 * Building a dashboard is a real capability but not an orchestrator tool — it is its own
 * endpoint, so it will never appear in the chat tool catalogue. Listed by hand for that reason.
 */
const BUILDER_CARD = {
  tool: 'dashboards.build',
  label: 'Build a dashboard',
  sub: 'Turn a description into saved widgets',
  scope: 'self',
  allowed: true,
};

/** Shown while the capabilities request is in flight, so the grid does not appear empty. */
const TOOL_SKELETONS = [0, 1, 2, 3, 4, 5];

const CANNOT = [
  'Change any record — every tool is read-only for now',
  'Show data you would not see in Zoho People yourself',
  'Answer from memory: if a tool returns nothing, it says so',
];

const EXAMPLES = [
  'How much casual leave do I have left?',
  'Who is on leave today?',
  'My attendance for last month',
  'Build me a dashboard of leave by type and status',
];

export default function Ai() {
  const app = useApp();

  /**
   * The whole screen is one request.
   *
   * With the API down it falls back to the client's own copy of the source registry, scoped to
   * the narrower role — enough to demo, and labelled so it is not mistaken for the server's
   * answer about this account.
   */
  const { data, loading, source } = useApi(
    (signal) => api.capabilities({ signal }),
    [],
    {
      fallback: () => ({
        model: null,
        routing: 'keywords only',
        readOnly: true,
        tools: [],
        sources: schemaFor({ isAdmin: false }),
      }),
    },
  );

  const tools = [...(data?.tools || []), BUILDER_CARD];
  const schema = data?.sources || [];

  return (
    <div className="view">
      <div className="page-head">
        <h1>AI {source === 'sample' && <span className="dw-tag">sample</span>}</h1>
        <p>
          What the assistant can reach, and what it will not do.
          {data && <> Routing: <strong>{data.routing}</strong>{data.readOnly && ' · read-only'}.</>}
        </p>
      </div>

      <div className="dw-card wide" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
        <span className="chat-ava" style={{ width: 44, height: 44, flex: '0 0 auto' }}><Logo size={22} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 650 }}>Ask in plain language</div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.55 }}>
            Every answer is fetched through an allow-listed tool and scoped to you at the moment
            you ask — never assembled from the model's own knowledge.
          </p>
          <div className="adb-suggest" style={{ marginTop: 12 }}>
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => { app.pickSuggestion(e); app.go('chat'); }}>{e}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="neuiq-group-label">Tools it can call</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(258px,1fr))', gap: 14 }}>
        {loading
          ? TOOL_SKELETONS.map((i) => <div className="card" key={i}><div className="dw-skel" style={{ height: 74 }} /></div>)
          : tools.map((t) => (
            /* A tool the caller may not call is DIMMED rather than hidden. Knowing that
               headcount exists and is not yours is more useful than wondering whether the
               assistant can do it at all. */
            <div className={'card' + (t.allowed ? '' : ' ai-tool-off')} key={t.tool}>
              <div className="k-label">
                <span className="k-icon"><Icon name={TOOL_ICONS[t.tool] || 'sparkles'} size={16} /></span>
                {t.label}
                <span className="chip" style={{ marginLeft: 'auto' }}>{t.allowed ? t.scope : 'no access'}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 10, lineHeight: 1.45 }}>{t.sub}</div>
              <code style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-dim)', marginTop: 8 }}>{t.tool}</code>
            </div>
          ))}
      </div>

      <div className="neuiq-group-label">Data it can query</div>
      <div className="dw-card">
        <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 14, lineHeight: 1.55 }}>
          Dashboards run against a read-only query engine. The assistant picks from this menu of
          sources and fields — it never writes a query of its own, so there is nothing to inject
          and no path that can change data.
        </p>
        <div className="dw-tablewrap">
          <table className="dw-table">
            <thead><tr><th>Source</th><th>Group by</th><th>Measures</th></tr></thead>
            <tbody>
              {schema.map((s) => (
                <tr key={s.source}>
                  <td>
                    {s.label}
                    {SOURCES[s.source]?.adminOnly && <span className="chip" style={{ marginLeft: 8 }}>admin</span>}
                  </td>
                  <td style={{ color: 'var(--ink-2)' }}>{s.group.join(', ')}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{s.numeric.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="neuiq-group-label">Recent activity</div>
      <div className="dw-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {SEED_AI_ACTIVITY.map((a) => (
            <div key={a.text} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <span className="k-icon" style={{ width: 28, height: 28 }}><Icon name={a.icon} size={15} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>{a.text}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-dim)', marginTop: 1 }}>
                  {a.tool} · {a.time}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="neuiq-group-label">What it will not do</div>
      <div className="dw-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {CANNOT.map((c) => (
            <div key={c} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--ink-2)' }}>
              <span style={{ color: 'var(--warn)', marginTop: 1, flex: '0 0 auto', display: 'flex' }}><Icon name="x" size={15} /></span>
              {c}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
