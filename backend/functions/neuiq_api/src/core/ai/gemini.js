/**
 * Gemini, for routing and for the dashboard builder.
 *
 * Optional by design. With no `GEMINI_API_KEY` the whole app still works through the keyword
 * router — better a plain answer than an error where an answer was asked for, and it means the
 * backend is developable and testable without a key or a network.
 *
 * Uses `fetch` against the REST endpoint rather than the SDK: two calls do not justify a
 * dependency, and the request shape is stable.
 *
 * **The model returns a tool name and arguments — never data, never prose that reaches the user.**
 * Its output is parsed, validated against the tool registry by the caller, and discarded if it
 * does not fit. Everything the user reads is written by a tool's own `say()`.
 */
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

const KEY = () => process.env.GEMINI_API_KEY || '';
const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export const available = () => !!KEY();
export const modelName = () => MODEL();

/** One JSON call. Returns the raw text part, or throws. */
async function generate({ system, user, timeoutMs = 8000 }) {
  // A hung model call must not hold a request open until the platform kills it - Catalyst
  // functions have an execution ceiling and this is the call most likely to approach it.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}/${MODEL()}:generateContent?key=${KEY()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the first JSON object out of a response, tolerating stray fences. */
function parseJson(text) {
  try {
    const clean = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

const ROUTER_SYSTEM = `You route HR questions for NeuIQ, a assistant over Zoho People.

Return ONLY JSON: {"tool": "<tool name>", "args": { ... }}
If no tool fits the question, return {"tool": null}.

Rules:
- Use ONLY a tool name from the list given. Never invent one.
- Use ONLY parameter names listed for that tool. Omit any you are unsure of.
- Do NOT answer the question yourself and do NOT include any figures. You choose the tool; the
  tool fetches the data.
- "me", "my" and "mine" refer to the caller: omit employeeId entirely rather than guessing one.
- If the question names another person, put that name in the tool's name parameter if it has one.
  Never guess an employeeId.
- If the request is ambiguous, or asks to CHANGE anything, return {"tool": null}. Every tool is
  read-only.`;

/**
 * Choose a tool for a message.
 *
 * `history` is included so follow-ups resolve — "and last month?" is unroutable without the
 * previous turn. Only the last few turns are sent: the whole conversation would grow the prompt
 * without improving the routing.
 */
export async function route({ message, history = [], tools }) {
  const catalogue = tools.map((t) => ({ tool: t.tool, description: t.sub, params: t.params }));
  const recent = history.slice(-4).map((h) => `${h.role}: ${h.text}`).join('\n');

  const text = await generate({
    system: `${ROUTER_SYSTEM}\n\nTools:\n${JSON.stringify(catalogue, null, 2)}`,
    user: recent ? `Conversation so far:\n${recent}\n\nCurrent question: ${message}` : message,
  });

  const parsed = parseJson(text);
  if (!parsed || !parsed.tool) return null;
  return { tool: String(parsed.tool), args: parsed.args && typeof parsed.args === 'object' ? parsed.args : {} };
}

const BUILDER_SYSTEM = `You design dashboards for NeuIQ, over Zoho People data.

Return ONLY JSON: {"title": string <=60 chars, "widgets": [ ... ]}

Each widget:
{"title": string <=48 chars,
 "type": "kpi" | "table" | "bar" | "line" | "area" | "pie" | "donut",
 "query": {"source": <a source below>, "groupBy": <a field from that source's "group" list>,
           "metric": "count"|"sum"|"avg"|"min"|"max",
           "field": <a field from that source's "numeric" list; required unless metric is count>,
           "sort": "desc"|"asc", "limit": 1..50}}

Choose the type that fits the QUESTION, not the easiest one:
- bar        ranking or comparison across categories. The safe default.
- line/area  anything over time. Use area when magnitude matters as much as direction.
- pie/donut  a share of ONE whole, and only with 2-6 slices. Never for a ranking.
- table      when the exact numbers matter more than the shape.
- kpi        emit at most once, with NO query. It reads the headline numbers.

Rules:
- 2 to 5 widgets.
- Use ONLY the sources and field names listed. Never invent one.
- "month" is the ONLY way to show change over time. Use it with line or area whenever the request
  mentions a trend, growth, "over the year", or "how are we doing".
- VARY the types. Five bar charts is a worse answer than a bar, a donut and a line, even when
  each of the five would have been defensible alone.
- No prose, no markdown fences. JSON only.`;

/** Prompt -> a widget spec. The caller re-whitelists every query before anything is stored. */
export async function buildDashboard({ prompt, schema }) {
  const text = await generate({
    system: `${BUILDER_SYSTEM}\n\nSources:\n${JSON.stringify(schema, null, 2)}`,
    user: prompt,
  });
  const parsed = parseJson(text);
  if (!parsed || !Array.isArray(parsed.widgets)) return null;
  return { title: String(parsed.title || '').slice(0, 60), widgets: parsed.widgets };
}
