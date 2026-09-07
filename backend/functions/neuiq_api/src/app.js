/**
 * The Express app: every route in one place.
 *
 * ONE Advanced I/O function running one app, not a function per route. Many functions would mean
 * many cold starts and the identity middleware duplicated across each of them — and the moment
 * it is duplicated, one copy drifts.
 *
 * Route handlers here are deliberately thin: parse, delegate, serialize. Every decision worth
 * making lives in `orchestrator/`, `dashboards/` or `services/`, so it is testable without an
 * HTTP request and reachable from more than one route.
 */
import express from 'express';
import {
  requestId, logger, authenticate, errorHandler, notFound, issueToken,
} from './middleware/index.js';
import { runQuery, schemaFor, dataset, isAdmin } from './dashboards/query.service.js';
import { cleanWidgets, cleanTitle, WIDGET_TYPES } from './dashboards/spec.js';
import { collection, newId } from './platform/store.js';
import { answer } from './orchestrator/index.js';
import { catalogue } from './services/zoho-people/tools/index.js';
import { buildDashboard, available as llmAvailable, modelName } from './orchestrator/llm/gemini.js';
import { keywordSpec } from './dashboards/builder.js';

const dashboards = collection('dashboards');

/** Async handlers need their rejections forwarded, or Express swallows them. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ok = (req, body) => ({ requestId: req.id, success: true, ...body });

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use(requestId);
  app.use(logger);

  // CORS for the Vite dev server. Explicitly not `*` with credentials - the browser refuses
  // that combination anyway, and being loose here is how a demo becomes a production hole.
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174').split(',');
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && origins.includes(origin)) {
      res.set('access-control-allow-origin', origin);
      res.set('vary', 'Origin');
      res.set('access-control-allow-headers', 'content-type,authorization,x-request-id');
      res.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const api = express.Router();

  // ---- health: unauthenticated on purpose, so a probe needs no credentials ----
  api.get('/health', (req, res) => res.json(ok(req, {
    status: 'up',
    model: llmAvailable() ? modelName() : 'keywords only',
    employees: dataset.employees.length,
  })));

  // ---- auth ----
  /**
   * Demo sign-in: pick a seeded account, get a token. No password check — see the note at the
   * top of middleware/index.js. `GET /auth/users` exists so the login screen can offer the
   * roles rather than making you memorise usernames.
   */
  api.get('/auth/users', (req, res) => res.json(ok(req, {
    users: dataset.employees
      .filter((e) => ['alex', 'priya', 'rohit', 'meera', 'arjun'].includes(e.username))
      .map((e) => ({ username: e.username, name: `${e.firstName} ${e.lastName}`, role: e.role, department: e.department })),
  })));

  api.post('/auth/login', (req, res) => {
    const username = String(req.body?.username || '').toLowerCase();
    const employee = dataset.employees.find((e) => e.username === username);
    if (!employee) {
      return res.status(401).json({ requestId: req.id, success: false, error: 'No such account.' });
    }
    res.json(ok(req, {
      token: issueToken(employee),
      user: {
        employeeId: employee.employeeId, username: employee.username,
        name: `${employee.firstName} ${employee.lastName}`, role: employee.role,
        department: employee.department, isAdmin: isAdmin(employee),
      },
    }));
  });

  // ---- everything below needs a caller ----
  api.use(authenticate);

  api.get('/me', (req, res) => res.json(ok(req, { user: { ...req.user, isAdmin: isAdmin(req.user) } })));

  // ---- chat ----
  api.post('/chat', wrap(async (req, res) => {
    const result = await answer({
      message: req.body?.message,
      history: Array.isArray(req.body?.history) ? req.body.history : [],
      user: req.user,
      requestId: req.id,
    });
    res.json(ok(req, result));
  }));

  // ---- ai: what the assistant can reach, for the AI tab ----
  api.get('/ai/capabilities', (req, res) => res.json(ok(req, {
    model: llmAvailable() ? modelName() : null,
    routing: llmAvailable() ? 'model, with keyword fallback' : 'keywords only',
    readOnly: true,
    tools: catalogue(req.user),
    sources: schemaFor(req.user),
  })));

  // ---- query: the resolve path behind every widget ----
  api.post('/query', wrap((req, res) => res.json(ok(req, runQuery(req.body, req.user)))));

  // ---- analytics: the headline numbers a kpi tile reads ----
  api.get('/analytics/summary', wrap((req, res) => {
    const scoped = (spec) => runQuery(spec, req.user).data;
    const leaveDays = scoped({ source: 'leave', metric: 'sum', field: 'days' })[0]?.value ?? 0;
    const pending = scoped({ source: 'leave', groupBy: 'status', metric: 'count' }).find((r) => r.name === 'Pending')?.value ?? 0;
    const avgHours = scoped({ source: 'attendance', metric: 'avg', field: 'hours' })[0]?.value ?? 0;
    res.json(ok(req, {
      kpis: [
        // Headcount is admin-only, so a non-admin sees their own figures rather than a gap -
        // an empty tile reads as broken, and "—" reads as broken-and-hiding-something.
        isAdmin(req.user)
          ? { name: 'Headcount', value: String(dataset.employees.length) }
          : { name: 'My department', value: req.user.department },
        { name: 'Leave days', value: String(leaveDays) },
        { name: 'Pending approvals', value: String(pending) },
        { name: 'Avg hours / day', value: String(avgHours) },
      ],
      scoped: !isAdmin(req.user),
    }));
  }));

  // ---- dashboards ----
  api.get('/dashboards', (req, res) => res.json(ok(req, {
    dashboards: dashboards.listByOwner(req.user.employeeId),
  })));

  api.post('/dashboards', (req, res) => {
    const row = {
      id: newId('dash'),
      // Ownership comes from the token on every path, never from the body.
      ownerId: req.user.employeeId,
      title: cleanTitle(req.body?.title),
      widgets: cleanWidgets(req.body?.widgets),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    res.status(201).json(ok(req, { dashboard: dashboards.insert(row) }));
  });

  api.patch('/dashboards/:id', (req, res) => {
    const patch = {};
    // An empty rename is a no-op, not a dashboard called "".
    if (typeof req.body?.title === 'string' && req.body.title.trim()) patch.title = cleanTitle(req.body.title);
    if (req.body?.widgets !== undefined) patch.widgets = cleanWidgets(req.body.widgets);
    const next = dashboards.update(req.user.employeeId, req.params.id, patch);
    if (!next) return res.status(404).json({ requestId: req.id, success: false, error: 'Dashboard not found' });
    res.json(ok(req, { dashboard: next }));
  });

  api.post('/dashboards/:id/duplicate', (req, res) => {
    const src = dashboards.findMine(req.user.employeeId, req.params.id);
    if (!src) return res.status(404).json({ requestId: req.id, success: false, error: 'Dashboard not found' });
    const copy = {
      ...src,
      id: newId('dash'),
      title: cleanTitle(`${src.title} (copy)`),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    res.status(201).json(ok(req, { dashboard: dashboards.insert(copy) }));
  });

  api.delete('/dashboards/:id', (req, res) => {
    if (!dashboards.remove(req.user.employeeId, req.params.id)) {
      return res.status(404).json({ requestId: req.id, success: false, error: 'Dashboard not found' });
    }
    res.json(ok(req, {}));
  });

  /**
   * Build a spec from a description. Nothing is saved — the client previews first.
   *
   * `source` names where the spec came from, so the UI can say "built offline" rather than
   * passing the keyword fallback off as the model's work. Presenting one as the other is how
   * people stop trusting both.
   */
  api.post('/dashboards/build', wrap(async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim().slice(0, 400);
    if (!prompt) return res.status(400).json({ requestId: req.id, success: false, error: 'prompt is required' });

    const schema = schemaFor(req.user);
    if (llmAvailable()) {
      try {
        const built = await buildDashboard({ prompt, schema });
        // Re-whitelisted before it leaves: the model's output is untrusted input like any other.
        const widgets = cleanWidgets(built?.widgets);
        if (widgets.length) {
          return res.json(ok(req, { title: built.title || prompt.slice(0, 48), widgets, source: modelName() }));
        }
      } catch (err) {
        console.warn(`[${req.id}] dashboard builder fell back to keywords: ${err.message}`);
      }
    }
    const fallback = keywordSpec(prompt, req.user);
    res.json(ok(req, { ...fallback, source: 'fallback' }));
  }));

  api.get('/dashboards/meta', (req, res) => res.json(ok(req, {
    widgetTypes: WIDGET_TYPES, sources: schemaFor(req.user),
  })));

  app.use('/api/v1', api);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
