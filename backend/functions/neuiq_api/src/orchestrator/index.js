/**
 * The orchestrator: one user message in, one grounded answer out.
 *
 *   normalize -> route to a tool -> validate args -> authorize -> run -> format
 *
 * Four properties are non-negotiable, and each maps to a specific line below:
 *
 *  1. **The model never produces business data.** It returns a tool name and arguments. The tool
 *     fetches, and the tool's own `say()` writes the sentence. A wrong figure is therefore a code
 *     bug, not a hallucination.
 *  2. **Tool output is data, never instructions.** Leave reasons and comments are free text an
 *     employee types, and it reaches the prompt. Nothing here ever feeds a tool result back to
 *     the model as a directive.
 *  3. **Authorization sits below routing.** `mayCall` and the tool's own subject check run after
 *     the model has chosen, so a model talked into asking for someone else's records still gets
 *     a 403.
 *  4. **Not-understood is a first-class outcome.** A router with no "ask a clarifying question"
 *     branch has to guess, and a confident wrong answer about someone's leave is worse than a
 *     question.
 */
import { TOOLS, mayCall, validateArgs, catalogue } from '../services/zoho-people/tools/index.js';
import { route as llmRoute, available as llmAvailable, modelName } from './llm/gemini.js';

/**
 * Mutation intent, refused before anything is routed.
 *
 * Every tool is read-only, so nothing here CAN change a record — but that is not enough on its
 * own. "delete all leave records" contains the word "leave", so the keyword router below happily
 * matches it to the read tool and answers with a list. Nothing was deleted, yet the user is shown
 * a confident response to a destructive request, which reads as though it worked.
 *
 * So say no out loud. This check runs first, ahead of both routers, and it is also why the
 * model's system prompt is told to return null for anything asking to change something: two
 * independent refusals, because this is the one class of request where being wrong is expensive.
 */
const MUTATION = /\b(delete|remove|drop|cancel|approve|reject|reset|update|change|edit|apply|submit|grant|revoke|terminate|promote|transfer)\b/i;

function refuseWrite(message) {
  if (!MUTATION.test(message)) return null;
  return {
    outcome: 'refused',
    answer:
      'I can only read from Zoho People — I cannot create, change, approve or delete anything. ' +
      'Ask me to look something up instead, or make the change in Zoho People directly.',
    tool: null,
    data: null,
  };
}

/**
 * Keyword router — the fallback, and the default when no model is configured.
 *
 * Deliberately dumb: it looks for the nouns this product actually has. Ordered most-specific
 * first, because "how much leave is left" contains both "leave" and "left" and only one of the
 * two readings is right.
 */
export function keywordRoute(message) {
  const m = message.toLowerCase();
  const has = (...w) => w.some((x) => m.includes(x));

  if (has('who is on leave', 'who\'s on leave', 'who is out', 'on leave today', 'off today', 'out today')) {
    return { tool: 'zohoPeople.teamOnLeave', args: {} };
  }
  if (has('balance', 'how much leave', 'how many days', 'left', 'remaining', 'entitlement')) {
    const type = ['casual', 'sick', 'earned', 'unpaid'].find((t) => m.includes(t));
    return { tool: 'zohoPeople.leaveBalance', args: type ? { leaveType: type[0].toUpperCase() + type.slice(1) } : {} };
  }
  if (has('attendance', 'hours', 'clock', 'late', 'present')) {
    return { tool: 'zohoPeople.attendanceSummary', args: {} };
  }
  if (has('headcount', 'how many people', 'how many employees', 'team size', 'by department', 'by location')) {
    const groupBy = m.includes('location') ? 'location' : m.includes('designation') ? 'designation' : 'department';
    return { tool: 'zohoPeople.headcount', args: { groupBy } };
  }
  if (has('leave', 'holiday', 'time off', 'absence', 'applications')) {
    return { tool: 'zohoPeople.leaveRecords', args: {} };
  }
  if (has('find', 'who is', 'lookup', 'look up', 'contact', 'which team')) {
    // Everything after the verb is the best available guess at the name.
    const name = message.replace(/.*?\b(find|who is|lookup|look up|contact)\b/i, '').replace(/[?.]/g, '').trim();
    if (name) return { tool: 'zohoPeople.employeeLookup', args: { name } };
  }
  return null;
}

/** Suggestions offered when nothing matched, filtered to what this caller may actually run. */
function clarify(user) {
  const allowed = catalogue(user).filter((t) => t.allowed).slice(0, 4);
  return {
    outcome: 'clarify',
    answer:
      'I could not tell which record you need. I can look up:\n- ' +
      allowed.map((t) => `${t.label} — ${t.sub.toLowerCase()}`).join('\n- ') +
      '\n\nTry naming one, for example "how much casual leave do I have left?"',
    tool: null,
    data: null,
  };
}

/**
 * Answer one message.
 *
 * `history` is accepted but only passed to the model, never to the keyword router: resolving
 * "and last month?" needs the previous turn, and the keyword path has no way to use it.
 */
export async function answer({ message, history = [], user, requestId }) {
  const text = String(message || '').trim();
  if (!text) {
    const e = new Error('message is required');
    e.status = 400;
    throw e;
    }

  // ---- refuse writes before routing anything ----
  const write = refuseWrite(text);
  if (write) return { ...write, source: 'guard' };

  // ---- route ----
  let routed = null;
  let source = 'keywords';

  if (llmAvailable()) {
    try {
      routed = await llmRoute({ message: text, history, tools: catalogue(user).filter((t) => t.allowed) });
      if (routed) source = modelName();
    } catch (err) {
      // A model outage must degrade to keywords, not 500. The log line is how you find out it
      // happened - a silent fallback that nobody can see is how you stop trusting the answers.
      console.warn(`[${requestId}] model routing failed, falling back to keywords: ${err.message}`);
    }
  }
  if (!routed) routed = keywordRoute(text);
  if (!routed) return { ...clarify(user), source };

  const tool = TOOLS[routed.tool];
  // A model can emit a tool name that does not exist. That is a routing miss, not a crash.
  if (!tool) return { ...clarify(user), source };

  // ---- authorize, THEN run ----
  if (!mayCall(routed.tool, user)) {
    return {
      outcome: 'refused',
      answer: `${tool.label} is not available on your account.`,
      tool: routed.tool,
      data: null,
      source,
    };
  }

  const args = validateArgs(routed.tool, routed.args || {});
  const data = tool.run(args, user);

  return {
    outcome: 'ok',
    // The tool writes the sentence, not the model. This is property 1, in one line.
    answer: tool.say(data),
    tool: routed.tool,
    args,
    data,
    source,
    /**
     * A pinnable spec, when the question maps onto a chartable query. This is what makes
     * "ask a question, pin the answer as a live tile" nearly free: the orchestrator already
     * knows which tool answered.
     */
    pinnable: PINNABLE[routed.tool] || null,
  };
}

/**
 * Chat answers that have a dashboard equivalent.
 *
 * Params are RELATIVE, never resolved dates: an absolute range pinned today would silently show
 * this month forever. See docs/backend/15-dashboards.md.
 */
const PINNABLE = {
  'zohoPeople.leaveRecords': {
    suggestedTitle: 'Leave days by type',
    widget: { type: 'bar', title: 'Leave days by type', query: { source: 'leave', groupBy: 'leaveType', metric: 'sum', field: 'days', sort: 'desc' } },
  },
  'zohoPeople.leaveBalance': {
    suggestedTitle: 'Leave by status',
    widget: { type: 'donut', title: 'Leave by status', query: { source: 'leave', groupBy: 'status', metric: 'count' } },
  },
  'zohoPeople.attendanceSummary': {
    suggestedTitle: 'Average hours by month',
    widget: { type: 'line', title: 'Average hours by month', query: { source: 'attendance', groupBy: 'month', metric: 'avg', field: 'hours' } },
  },
  'zohoPeople.headcount': {
    suggestedTitle: 'Headcount by department',
    widget: { type: 'bar', title: 'Headcount by department', query: { source: 'employees', groupBy: 'department', metric: 'count', sort: 'desc' } },
  },
};
