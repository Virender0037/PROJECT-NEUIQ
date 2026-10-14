import { useApp } from '@shared/context/AppContext.jsx';
import El from '@shared/components/El.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { useApi, api } from '@shared/api';
import { SOURCES } from '@shared/dashboards';
import { errorState } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * AI — what the assistant can actually do, stated plainly.
 *
 * The twin of ui/hybrid/pages/Ai.jsx, in Classic's chrome. It exists because "ask me anything" is
 * a lie in an enterprise assistant: it can reach exactly the tools it has been given, over
 * exactly the data the caller is allowed to see. Showing that up front is the difference between
 * a user trusting an answer and second-guessing every one.
 *
 * The tool list comes from GET /ai/capabilities, never from a constant here — this screen's whole
 * claim is "here is exactly what the assistant can reach", and a hardcoded list makes that claim
 * about the code as it was written rather than about the server as it is now.
 */
const TOOL_ICONS = {
  'zohoPeople.leaveBalance': 'checkCircle',
  'zohoPeople.leaveRecords': 'file',
  'zohoPeople.attendanceSummary': 'clock',
  'zohoPeople.teamOnLeave': 'user',
  'zohoPeople.headcount': 'layoutGrid',
  'zohoPeople.employeeLookup': 'search',
};

/** Building a dashboard is a real capability but its own endpoint, so it never appears in the
 *  chat tool catalogue. Listed by hand for that reason. */
const BUILDER_CARD = {
  tool: 'dashboards.build',
  label: 'Build a dashboard',
  sub: 'Turn a description into saved widgets',
  scope: 'self',
  allowed: true,
};

const CANNOT = [
  'Change any record — every tool is read-only',
  'Show data you would not see in Zoho People yourself',
  'Answer from memory: if a tool returns nothing, it says so',
];

const EXAMPLES = [
  'How much casual leave do I have left?',
  'Who is on leave today?',
  'My attendance for last month',
  'Build me a dashboard of leave by type and status',
];

const CARD = {
  border: 'var(--border-w) solid var(--border)',
  background: 'var(--surface)',
  borderRadius: 14,
  padding: 16,
  boxShadow: 'var(--sh-xs)',
  minWidth: 0,
};

const Label = ({ children }) => (
  <div style={{ fontSize: 13, fontWeight: 600, margin: '26px 0 12px', color: 'var(--text)' }}>{children}</div>
);

export default function Ai() {
  const app = useApp();

  /**
   * The whole screen is one request. With the API down it falls back to the client's own copy of
   * the source registry at the narrower role — enough to demo, and labelled so it is not
   * mistaken for the server's answer about this account.
   */
  // No fallback (Phase 4): an unreachable server used to produce a client-side capability list,
  // labelled "sample". Now the page says the API is unavailable and lists nothing it was not told.
  const { data, loading, error } = useApi((signal) => api.capabilities({ signal }), []);

  const tools = [...(data?.tools || []), BUILDER_CARD];
  const schema = data?.sources || [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '6px 26px 40px' }}>
      <h2 style={{ fontFamily: 'Geist', fontSize: 20, fontWeight: 600, letterSpacing: '-.01em', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 9 }}>
        AI
      </h2>
      <p style={{ fontSize: 13.5, color: 'var(--text-subtle)', margin: '0 0 4px' }}>
        What the assistant can reach, and what it will not do.
        {data && <> Routing: <strong style={{ color: 'var(--text-muted)' }}>{data.routing}</strong>{data.readOnly && ' · read-only'}.</>}
      </p>

      {error && <div style={{ margin: '12px 0' }}><EmptyPanel state={errorState(error)} /></div>}

      <Label>Try asking</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {EXAMPLES.map((e) => (
          <El key={e} as="button" onClick={() => { app.pickSuggestion(e); app.go('chat'); }}
            css="padding:7px 12px;border:var(--border-w) solid var(--border);background:transparent;color:var(--text-muted);border-radius:999px;font-size:12.5px;cursor:pointer;font-family:'Inter Tight';text-align:left"
            hover="background:var(--hover);color:var(--text)">{e}</El>
        ))}
      </div>

      <Label>Tools it can call</Label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 14 }}>
        {loading
          ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={CARD}><div className="nr-skel" style={{ height: 66 }} /></div>)
          : tools.map((t) => (
            /* A tool the caller may not call is DIMMED rather than hidden. Knowing that headcount
               exists and is not yours is more useful than wondering whether the assistant can do
               it at all. */
            <div key={t.tool} style={{ ...CARD, opacity: t.allowed ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 30, height: 30, flex: '0 0 auto', borderRadius: 9, background: 'var(--chip)', color: 'var(--chip-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={TOOL_ICONS[t.tool] || 'sparkles'} size={15} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{t.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{t.allowed ? t.scope : 'no access'}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-subtle)', marginTop: 9, lineHeight: 1.45 }}>{t.sub}</div>
              <code style={{ display: 'block', fontSize: 11, color: 'var(--text-subtle)', marginTop: 7 }}>{t.tool}</code>
            </div>
          ))}
      </div>

      <Label>Data it can query</Label>
      <div style={CARD}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.55 }}>
          Dashboards run against a read-only query engine. The assistant picks from this menu of
          sources and fields — it never writes a query of its own, so there is nothing to inject
          and no path that can change data.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Source', 'Group by', 'Measures'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-subtle)', fontWeight: 600, borderBottom: 'var(--border-w) solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schema.map((s) => (
                <tr key={s.source} style={{ borderTop: 'var(--border-w) solid var(--border)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    {s.label}
                    {SOURCES[s.source]?.adminOnly && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-subtle)' }}>admin</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{s.group.join(', ')}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{s.numeric.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Label>What it will not do</Label>
      <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 11 }}>
        {CANNOT.map((c) => (
          <div key={c} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--red)', marginTop: 1, flex: '0 0 auto', display: 'flex' }}><Icon name="x" size={15} /></span>
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}
