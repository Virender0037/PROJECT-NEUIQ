# CLAUDE.md — NeuIQ

Guidance for Claude Code sessions working in this repository. Read this before touching anything.

Facts here were verified against the source on 2026-09-07. Where the existing Markdown docs
disagree with the code, **the code is described first and the discrepancy is flagged** — several
docs predate the current implementation.

---

## Project purpose

**NeuIQ** is a conversational AI layer over **Zoho People** (HR system), built for a client.

Ask a question in plain language → get an answer backed by Zoho People data → optionally **pin
that answer to a dashboard as a tile that re-resolves itself** on every read.

It began as a backend-first "Zoho People Orchestrator POC" with the UI deferred. That ordering
inverted: the UI is now the most complete part, and the backend runs on a deterministic seed
because there is no Zoho sandbox yet.

---

## The ten principles

These are not style preferences. Each one is enforced somewhere in the code, and several have
tests that exist specifically to fail if the property is removed.

1. **The LLM must never invent business data.** The model returns a *tool name and arguments*.
   The tool fetches, and the tool's own `say()` writes the sentence
   (`services/zoho-people/tools/index.js`). A wrong figure is therefore a reproducible code bug,
   not a hallucination.
2. **Retrieved data is data, never instructions.** Leave reasons, comments and names are free text
   an employee can type, and that text reaches the prompt. Tool output is quoted, never obeyed;
   nothing feeds a tool result back to the model as a directive. Employee records are
   field-whitelisted (`publicEmployee()`) before leaving a tool — a raw record carries PII no
   prompt needs.
3. **The query DSL is an allow-listed menu, not an unrestricted parser.** Every field name that
   reaches the data layer must already appear in the `SOURCES` registry. No SQL, no ZCQL, no write
   path — there is nothing to inject and nothing that can change data.
4. **Authorization is re-checked on every read, never at build time.** Scoping is applied inside
   `runQuery()` in `dashboards/query.service.js`, not in the route handler, *because the AI builder
   calls the same function*. Putting it in the route would leave the builder path unguarded, which
   is exactly the path an attacker would use.
5. **Dashboard widgets store the question, never the answer.** `{type, title, query}` persists;
   the value resolves on every read. A stored number has already escaped whoever's permissions
   produced it — so a dashboard saved by an HR admin and opened by an employee must return the
   employee's rows.
6. **Never expose tokens, credentials or employee-sensitive data in logs.** The request logger
   emits `{requestId, method, path, status, ms, actor}` and nothing else. `requestId` is the
   correlation handle. Errors ≥500 return a generic message; the detail goes to the log only.
7. **Never silently substitute sample data when a data-source call fails.** Anything showing sample
   data must say so — a `sample` pill on the card, the bubble, or the page. A fallback
   indistinguishable from live data is worse than an error message.
8. **A real authorization failure must remain a 403.** `useApi` falls back **only** on
   `err.offline` (the request never reached the server). A 403 is a *real answer* about someone's
   permissions; substituting invented numbers for it would misrepresent their access. Likewise
   `runQuery` throws a 403 for an admin-only source rather than returning an empty result — "no
   data" and "not for you" are different answers.
9. **Frontend and backend copies of the shared contract must stay synchronized.**
   `SOURCES`, `sanitize()` and `cleanWidgets()` exist in both trees and must not drift.
10. **Do not edit the vendored Hybrid `global.css` directly** unless explicitly instructed. It is
    byte-for-byte copied from another project's design system so it can be re-synced.

---

## Before Making Any Change

Run this checklist every time, in order:

1. **Understand the requested change.** What behaviour changes, and for whom? If the request is
   ambiguous in a way that changes the security surface, ask rather than assume.
2. **Identify affected frontend/backend contracts.** Does it touch `SOURCES`, `sanitize()`,
   `cleanWidgets()`, `WIDGET_TYPES`, `METRICS`, `OPS`, the widget shape, or an API response
   envelope? If yes, **both** copies must change together — see *Contract mirroring* below.
3. **Inspect the relevant files before editing.** The headers in this codebase carry the reasoning
   behind each decision. Read them; several rules look arbitrary until you do.
4. **Identify the security/authorization impact.** Ask specifically: does this move a check
   relative to routing? does it widen the whitelist? does it let a value be stored rather than
   re-resolved? does it change what a non-admin can reach? does it put anything sensitive in a
   log or a response body?
5. **Make the smallest safe change.** Match the surrounding idiom — comment density, naming,
   error shapes.
6. **Run the relevant tests.** `npm run check` from the root, or the individual suite.
7. **Verify no regressions.** Both suites must stay green at their full counts (65 + 27). A test
   that starts passing for a new reason is as much a regression as one that fails.
8. **Update documentation if behaviour changed.** The docs in `docs/` are the specification; if
   you change what the code does, say so there and here.

---

## Current architecture

```
                    frontend/  (Classic | Hybrid | Modern)
                         |  shared/api/client.js — the only fetch() in the app
                         |  POST /api/v1/chat, POST /api/v1/query, /dashboards CRUD
                         v
                    backend/   Express app (Catalyst Advanced I/O function, not yet deployed)
                         |
             +-----------+-----------+
             |                       |
        Orchestrator            Dashboards
   (Gemini 2.5 Flash routes     (widget specs in the store;
    intent -> tool; keyword      values re-resolved on read)
    fallback when no key)
             |                       |
             +-----------+-----------+
                         |
                 Zoho People tools  (allow-listed, 6 read-only tools)
                         |
                 seed.js  <- deterministic 50-employee dataset
                            (Zoho People API NOT connected — no sandbox)
```

Request path through the orchestrator, in order:

```
normalize -> refuse writes -> route (model, else keywords) -> tool exists?
          -> mayCall(role) -> validateArgs -> tool.run(subject check) -> tool.say()
```

Authorization sits **below** routing. Both refusals are independent and both are load-bearing.

---

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | React 18.3, react-router-dom 6.30, Vite 8, plain JS/JSX (no TypeScript) |
| Frontend styling | No CSS framework, no chart library, no icon library. Inline SVG charts, local Lucide-geometry icon set |
| Backend | Node ≥20, ES modules, **Express 4.21 — the only runtime dependency** |
| LLM | Gemini 2.5 Flash via plain `fetch` against the REST endpoint (no SDK). **Optional** |
| Data source | Zoho People API — **not connected**; `seed.js` stands in |
| Persistence | File-backed JSON locally; Catalyst Data Store is the target |
| Tests | No framework. Two plain `node` scripts with `assert/strict` |
| Deploy target | Zoho Catalyst, Functions → Advanced I/O, one function named `neuiq_api` |

---

## Repository structure

```
PROJECT-NEUIQ/
├─ package.json              # workspace root: dev / check / install:all / build
├─ scripts/dev.mjs           # spawns API :4200 + UI :5174; if either dies, both stop
├─ backend/
│  ├─ server.js              # local entry; replaced by the Catalyst function handler
│  ├─ .env.example           # every value optional, all defaulted
│  ├─ db/dashboards.json     # local file store (gitignored, generated)
│  ├─ tests/check.mjs        # 65 assertions
│  ├─ evals/                 # EMPTY — intended: labelled utterance -> expected tool
│  └─ functions/neuiq_api/src/
│     ├─ app.js                       # every route; thin: parse, delegate, serialize
│     ├─ middleware/index.js          # requestId, logger, authenticate, errorHandler, notFound
│     ├─ orchestrator/
│     │  ├─ index.js                  # write guard -> route -> authorize -> run -> format
│     │  └─ llm/gemini.js             # optional; ROUTER_SYSTEM + BUILDER_SYSTEM prompts
│     ├─ services/zoho-people/
│     │  ├─ seed.js                   # deterministic 50 employees, fixed NOW
│     │  └─ tools/index.js            # the allow-list: 6 read-only tools
│     ├─ dashboards/
│     │  ├─ query.service.js          # SOURCES registry, sanitize, runQuery, schemaFor
│     │  ├─ spec.js                   # cleanWidgets, cleanTitle, WIDGET_TYPES
│     │  └─ builder.js                # keyword fallback builder, scope-aware
│     └─ platform/store.js            # wraps persistence so the SDK is swappable
└─ frontend/
   ├─ vite.config.js         # @shared / @ui aliases; port pinned to 5174
   ├─ test/dashboards.check.mjs   # 27 assertions
   └─ src/
      ├─ main.jsx            # BrowserRouter -> AppProvider -> App
      ├─ App.jsx             # lazy-selects the UI style (lazy is a CORRECTNESS requirement)
      ├─ shared/             # style-agnostic; used by all three UIs
      │  ├─ api/{client.js, hooks.js, index.js}
      │  ├─ dashboards/{spec.js, index.js, useDashboards.js, useWidget.js}
      │  ├─ context/AppContext.jsx
      │  ├─ lib/{routes.js, theme.js, style.js, session.js}
      │  ├─ data/{mockData.js, appearance.js, seedDashboards.js}
      │  ├─ components/{El.jsx, charts.jsx, UiPlaceholder.jsx, UiSwitching.jsx}
      │  └─ icons/
      └─ ui/{classic,hybrid,modern}/
```

**Empty scaffold directories in the backend** (present, unused): `src/config/`, `src/routes/`,
`src/observability/`, `src/utils/`, `services/zoho-people/{transformers,validators}/`,
`orchestrator/llm/prompts/`.

> **Doc discrepancy:** `docs/backend/03-project-structure.md` lists `agents/`, `controllers/`,
> `auth/`, `cache/`, `rate-limit/`, `clients/`. `agents/` and `controllers/` were deliberately
> dropped (a tool registry plus thin routes makes them empty layers); the rest were never created.
> The `dashboards/` module, now central, appears nowhere in that doc.

---

## Running it locally

```bash
npm run install:all      # backend + frontend (frontend uses --legacy-peer-deps)
npm run dev              # API on :4200, UI on :5174 — Ctrl-C stops both
npm run check            # 65 backend + 27 frontend assertions
npm run build            # frontend production build
```

Individually:

```bash
cd backend  && npm install && npm run dev     # http://localhost:4200/api/v1
cd frontend && npm install --legacy-peer-deps && npm run dev   # http://localhost:5174
```

Nothing needs configuring. `.env` is optional; every value has a default.

Sign in with a seeded account — the sign-in screen lists them. **Which account you pick changes
every number in the app**, because every read is scoped to the caller. `POST /query` with
`{"source":"leave","metric":"count"}` returns different totals for `alex` and `meera`.

Add `?ui=hybrid` to the URL to open a specific layout; the choice is remembered.

---

## Important commands

| Command | From | What it does |
| --- | --- | --- |
| `npm run dev` | root | Both servers, prefixed output, either dying stops both |
| `npm run check` | root | Both test suites |
| `npm run install:all` | root | Installs both |
| `npm run build` | root | Frontend production build |
| `npm run dev` | backend | `node --watch server.js` on :4200 |
| `npm start` | backend | `node server.js` |
| `npm run check` | backend | `node tests/check.mjs` — 65 assertions, exit 1 on failure |
| `npm run dev` | frontend | Vite on :5174 (pinned; 5173 belongs to a sibling project) |
| `npm run check` | frontend | `node test/dashboards.check.mjs` — 27 assertions |
| `npm run preview` | frontend | Preview the production build |

---

## Current API structure

All routes under `/api/v1`. Everything except `/health`, `/auth/users` and `/auth/login` requires
`Authorization: Bearer <token>`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Unauthenticated on purpose. Returns `status`, `model` (name or `"keywords only"`), `employees` |
| `GET` | `/auth/users` | The five seeded accounts, for the sign-in picker |
| `POST` | `/auth/login` | `{username}` → `{token, user}`. **No password check** |
| `GET` | `/me` | The caller as the server sees them, plus `isAdmin` |
| `POST` | `/chat` | `{message, history}` → `{outcome, answer, tool, args, data, source, pinnable}` |
| `GET` | `/ai/capabilities` | `{model, routing, readOnly, tools, sources}` — scoped to the caller |
| `POST` | `/query` | A QuerySpec → `{data: [{name, value, count}], meta}` |
| `GET` | `/analytics/summary` | `{kpis, scoped}`. Headcount only for admins; others see their department |
| `GET` | `/dashboards` | List — own only |
| `POST` | `/dashboards` | Create. `ownerId` from the token, never the body. 201 |
| `PATCH` | `/dashboards/:id` | Rename / replace widgets. Empty title is a no-op. 404 if not yours |
| `POST` | `/dashboards/:id/duplicate` | Copy. 201 |
| `DELETE` | `/dashboards/:id` | 404 if not yours |
| `POST` | `/dashboards/build` | `{prompt}` → `{title, widgets, source}`. **Nothing is saved** |
| `GET` | `/dashboards/meta` | `{widgetTypes, sources}` — sources scoped to the caller |

**Response envelope:** `{requestId, success, ...body}` on success;
`{requestId, success: false, error}` on failure. `x-request-id` is set on every response and
matches one structured log line. The frontend's `request()` unwraps the envelope once so screens
never see it.

> **Doc discrepancy:** `docs/backend/09-api-contract.md` documents only `POST /chat` and omits
> `success` from the envelope. It predates the implementation.

**Ownership rule:** every store method takes `ownerId` first, and `findMine` looks up id **and**
ownerId together — so another user's row is a **404, not a 403**. A 403 would confirm the row
exists.

**CORS** is an explicit allow-list from `CORS_ORIGINS` (default `localhost:5173,5174`).
Deliberately not `*`.

---

## Authentication and authorization — current state

**This is a labelled demo stub. Do not treat it as shippable.**

What it does:
- HMAC-SHA256 signed token (`base64url(payload).signature`), 12-hour expiry in the payload.
- Verified with `timingSafeEqual`, not `===`. A tampered role fails verification — there is a test
  for exactly this.
- Malformed token → `null`, never a throw, so a bad header is a 401 rather than a 500.
- **The employee record is looked up fresh from the dataset on every request**, not trusted from
  the token — so a role change takes effect immediately and a token cannot assert a role its
  employee does not have.

What it does **not** do: no password check, no revocation, no refresh, no real user store.

Its actual purpose is to establish *which Zoho employee the caller is*, because every other
guarantee rests on that.

### Roles and seeded accounts

| username | role | may read |
| --- | --- | --- |
| `alex`, `priya` | `employee` | own leave and attendance only |
| `rohit`, `arjun` | `manager` | own, plus direct reports' |
| `meera` | `hr_admin` | the whole organisation, including headcount |

`isAdmin(user)` is `user.role === 'hr_admin'` — a property of the role, never inferred from a job
title.

### Three enforcement layers, in order

1. **Write guard** (`orchestrator/index.js`) — a mutation-verb regex refuses before *any* routing.
   Every tool is read-only, so nothing *can* change a record, but `"delete all leave records"`
   contains "leave" and the keyword router would otherwise match the read tool and answer
   confidently. A test caught that. The model's system prompt independently tells it to return
   `null` for mutations: two independent refusals.
2. **Tool scope** — `mayCall(tool, user)` compares `ROLE_RANK` against the tool's declared
   `scope` (`self` | `team` | `admin`). Runs **after** the model has chosen.
3. **Subject check** — `resolveSubject(user, employeeId)` inside each tool. An admin may ask about
   anyone; a manager only about direct reports; anyone else only about themselves. Throws 403.

Separately, `runQuery()` applies **row-level scoping** by pushing the source's `scope(employeeId)`
filter on before the query runs, and refuses admin-only sources with a 403.

---

## Zoho People integration — current state

**Not connected.** There is no Zoho sandbox, no OAuth client, no HTTP client, no token provider.

What exists: six read-only tools modelled on the documented API shapes, fed by `seed.js`
(deterministic, seeded PRNG, fixed `NOW = 2026-09-04`, 50 employees, six months of leave and
attendance).

| Tool | Scope | Params |
| --- | --- | --- |
| `zohoPeople.leaveBalance` | self | `employeeId?`, `leaveType?` |
| `zohoPeople.leaveRecords` | self | `employeeId?`, `status?`, `limit?` |
| `zohoPeople.attendanceSummary` | self | `employeeId?`, `month?` |
| `zohoPeople.teamOnLeave` | team | — |
| `zohoPeople.employeeLookup` | team | `name` (required) |
| `zohoPeople.headcount` | admin | `groupBy?` |

Each tool declares `params` / `scope` / `run` / `say`. `validateArgs` **refuses** an unknown key or
a wrong type rather than dropping it quietly — a silently ignored parameter means the answer is
about something other than what was asked.

**Before writing any real Zoho client, confirm two things** (`docs/backend/README.md` flags both):
- **The data-centre trap:** a token minted on `accounts.zoho.in` will *not* work against `.com`
  endpoints.
- **Which of Zoho's several employee identifiers** each endpoint expects.

The real tool catalogue depends on which modules, leave types and custom forms the client's org
actually has. Until there is sandbox access, the current tools are educated guesses.

---

## Gemini integration

Optional by design. `orchestrator/llm/gemini.js` calls the REST endpoint with plain `fetch` —
two calls do not justify an SDK dependency.

- No `GEMINI_API_KEY` → the keyword router handles everything and `/health` reports
  `"keywords only"`. The backend is fully developable and testable with no key and no network.
- A model outage **degrades to keywords with a `console.warn` line, never a 500**. The log line is
  deliberate: a silent fallback nobody can see is how you stop trusting the answers.
- 8-second `AbortController` timeout — a hung model call must not hold a request open until the
  platform kills it. Catalyst has an execution ceiling and this is the call most likely to reach it.
- `temperature: 0`, `responseMimeType: 'application/json'`.
- Two system prompts live in this file: `ROUTER_SYSTEM` (choose a tool, never answer, never invent
  a tool name, return `null` for anything ambiguous or mutating) and `BUILDER_SYSTEM` (2–5 widgets,
  chart type must fit the question, vary the types, never invent a source or field).
- Routing sends only the **last 4 turns** of history; the frontend sends the last 6 and none at all
  in incognito.
- Builder output is **re-whitelisted through `cleanWidgets()` before it leaves the route** — the
  model's output is untrusted input like any other.

> **Doc discrepancy:** `docs/backend/03-project-structure.md` and `backend/README.md` describe
> `orchestrator/llm/prompts/` as versioned prompt files. That directory is empty; the prompts are
> currently string constants inside `gemini.js`.

---

## Dashboard architecture

**A widget stores the question, never the answer.**

```js
persisted:  { type, title, query: { source, groupBy, metric, field, filter, sort, limit } }
NOT:        { type, title, value: "18.4k" }
```

### The query DSL

```
source   'leave' | 'attendance' | 'employees'
groupBy  must appear in that source's `group` list
metric   count | sum | avg | min | max
field    must appear in that source's `numeric` list
filter   [{field, op, value}]  op ∈ eq ne gt gte lt lte contains
sort     asc | desc
limit    1..50
```

### The source registry — **this object IS the security boundary**

| Source | Group by | Numeric | Scope |
| --- | --- | --- | --- |
| `leave` | month, leaveType, status, departmentId | days | pinned to `employeeId` |
| `attendance` | month, status, departmentId | hours, lateMinutes | pinned to `employeeId` |
| `employees` | department, location, designation, employmentType | tenureMonths | `scope: null` → **admin only by construction** |

A source whose `scope` is `null` has no owner field, so there is no safe slice of it. It is
admin-only *by construction*, not by a flag someone has to remember to add.

### `sanitize()` behaviour

```
unknown source                  -> null  (drops the widget entirely)
groupBy not in source.group     -> dropped
field not in source.numeric     -> dropped
metric not in METRICS           -> dropped
op not in OPS                   -> coerced to 'eq'
limit                           -> clamped to 1..50
filter                          -> capped at 5 clauses
metric != count with no field   -> demoted to count
```

`cleanWidgets()` wraps it: unknown widget type → falls back to `bar` (a silent downgrade beats a
blank card); a `kpi` carries no query; **a chart with no `groupBy` is dropped entirely** (a
single-bar tile whose title promises a breakdown it cannot show is worse than a missing widget);
the array is capped at 12; titles at 60 chars.

`WIDGET_TYPES = ['kpi', 'table', 'bar', 'line', 'area', 'pie', 'donut']`.

### Other properties worth knowing

- `month` groupings always sort in calendar order regardless of `sort` — a trend line with its
  months shuffled is worse than no chart. It sorts on the raw key (`2026-03`) and displays a label
  (`Mar 2026`).
- `POST /dashboards/build` **saves nothing**; the client previews first.
- `source` on a build result is the model name, `fallback` (server keyword builder), or `sample`
  (client-side) — and the UI shows it. Passing one off as the other is how users stop trusting both.
- The keyword fallback builder **respects scope**: an employee asking for headcount gets a leave
  chart, not an admin-only widget that would 403 on resolve.
- Chat answers carry a `pinnable` spec when the question has a chartable equivalent. Its params are
  **relative, never resolved dates** — an absolute range pinned today would show this month forever.

### Not yet implemented from the design

`docs/backend/15-dashboards.md` specifies per-widget caching (`widget:{id}:{period}:{callerId}` —
the caller **must** be in the key or it is a data leak), batched widget resolution with a
concurrency cap and per-widget timeouts, and `specVersion` migration on read. **None of these
exist yet.** `SPEC_VERSION = 1` is declared but unused.

---

## UI status: Classic / Hybrid / Modern

| Style | Directory | Status |
| --- | --- | --- |
| **Classic** | `src/ui/classic/` | **Working.** The original prototype, chat-first. 12 page files. Inline `<El>` primitive, no component CSS classes. `styles/theme.css` (215 lines, mostly tokens) |
| **Hybrid** | `src/ui/hybrid/` | **Working.** Data workspace: floating dock, analytics tabs, AI dashboards. 14 page files. Real class system. `styles/global.css` (5,277 lines, **vendored**) + `styles/neuiq.css` (251 lines, ours) |
| **Modern** | `src/ui/modern/` | **Stub.** Renders `<UiPlaceholder name="Modern" />` |

> **Doc discrepancy:** the root `README.md` says "Classic prototype working; Modern + Hybrid
> stubbed." That is wrong — **only Modern is a stub.** `frontend/README.md` and
> `docs/frontend/UI-STYLES.md` are correct.

Style resolution order: `?ui=<style>` in the URL → `localStorage` → `CONFIG.uiStyle` in
`AppContext.jsx`.

**Styles must stay lazy-loaded.** This is a correctness requirement, not an optimisation: Hybrid's
stylesheet styles bare `html`, `body` and `table`. Imported statically it would restyle Classic too,
whichever style was mounted. The `Suspense` fallback is a real screen rather than `null`, because
during the swap the outgoing stylesheet has unloaded and an unstyled white page looks like a crash.

**Theming:** 7 themes on two axes — `data-theme` (light/dark/mono/aqua) picks component rules,
`data-variant` (dim/mono/aqua) re-tints base tokens, so dim/mono-dark/aqua-dark reuse every dark
rule instead of duplicating it. Plus `data-accent` (5 options). All in **shared** state.
`applyTheme(theme, accent)` returns a cleanup function that removes all three attributes — not
optional, because the outgoing style's stylesheet unloads and its attributes would style the
incoming one with tokens it never defined.

> **Doc discrepancy:** `docs/frontend/{ARCHITECTURE,COMPONENTS,THEMING}.md` are Classic-only and
> stale. ARCHITECTURE.md says "there is no router" — there is (`react-router-dom`,
> `shared/lib/routes.js` is the one route table, and the URL owns the current screen). THEMING.md
> describes two themes and points at `mockData.js` for `THEME_CARDS`; there are seven, defined in
> `shared/lib/theme.js` with cards in `shared/data/appearance.js`.

**Routing:** `shared/lib/routes.js` maps `view` keys to paths. Screens never read the URL — they
call `app.go('dashboard')` and read `app.view`. `empty` and `chat` deliberately share `/chat`.

---

## Data persistence

**Today:** `platform/store.js` — a file-backed JSON store at `backend/db/dashboards.json`
(gitignored, generated on first run; override with `NEUIQ_DB_DIR`). An in-memory `Map` mirrors it
so reads do not hit disk. A corrupt file starts empty **and logs a warning** rather than silently
serving `[]`.

The wrapper exists because `zcatalyst-sdk-node` only works inside the Catalyst runtime — imported
directly, the backend could not run or be tested on a laptop. **Swapping to Catalyst Data Store is
a change to this one file.**

Known limitation, marked in the source: whole-file rewrite per mutation, O(n) scan per query.
Fine at a few hundred dashboards; the ceiling is roughly 10k rows or the first concurrent writer.

**Business data is not persisted at all** — employees, leave and attendance come from `seed.js`
on every boot, and will come from Zoho People later.

**Target schema** (`docs/backend/15-dashboards.md`): `Dashboard(id, ownerId, title, widgets JSON,
createdAt, updatedAt)` with `ownerId` indexed. Deliberately non-relational — the spec shape will
change weekly during the POC, and `specVersion` lets you migrate on read.

---

## Contract mirroring requirements

`SOURCES`, `sanitize()`, `cleanWidgets()`, `METRICS`, `OPS`, `WIDGET_TYPES` and `CHART_TYPES` exist
in **two places**, and were verified identical:

| | Backend | Frontend |
| --- | --- | --- |
| Registry + sanitize | `backend/functions/neuiq_api/src/dashboards/query.service.js` | `frontend/src/shared/dashboards/spec.js` |
| Widget cleaning | `backend/functions/neuiq_api/src/dashboards/spec.js` | `frontend/src/shared/dashboards/spec.js` |

**Any change to either must be made in both, in the same commit.**

Why the duplication is intentional: the client copy lets Chart Builder reject an invalid
combination while you are still choosing it, without a round trip. **The server copy is the one
that matters** — the client's is a courtesy, never a substitute.

Why `spec.js` is a separate file from `dashboards/index.js`: `spec.js` imports **nothing** — no
React, no API client, no build aliases. That is what lets `test/dashboards.check.mjs` run it under
plain `node`. The whitelist is the one part of this feature that most deserves a test that cannot
be skipped for want of a bundler. **Do not add imports to `spec.js`.**

> **Stale path references to fix eventually:** `query.service.js` (header comment),
> `docs/backend/15-dashboards.md` and `docs/frontend/00-overview.md` all point at
> `frontend/src/ui/hybrid/lib/dashboards.js`; `docs/frontend/API-INTEGRATION.md` points at
> `ui/hybrid/lib/spec.js`. **Neither path exists.** The contract moved to
> `frontend/src/shared/dashboards/spec.js` when Classic gained dashboards too.

---

## Testing

```bash
npm run check                 # from root: both suites
cd backend  && npm run check  # 65 assertions  -> "all 65 backend checks pass"
cd frontend && npm run check  # 27 assertions  -> "all 27 contract checks pass"
```

Both were run and pass at these counts. No framework, no mocks — plain `assert/strict` against the
real modules, exit 1 on any failure.

What is asserted is chosen deliberately: **the things that are security boundaries**, not the
things that are easy to test. Backend coverage spans the seed's determinism and referential
integrity, `sanitize` rejection, scoping by role, admin-only refusal, `cleanWidgets`, the keyword
router and builder, tool arg validation, `mayCall`, the write guard, and token
signing/tamper-resistance.

**If the whitelist stops rejecting or scoping stops applying, that must fail loudly.** Do not
"fix" a failing assertion by loosening the expectation.

`backend/evals/` is empty. `docs/backend/11-testing.md` and `backend/README.md` both describe an
eval suite (labelled utterance → expected tool) that does not exist yet.

There is **no CI** — nothing runs `npm run check` automatically.

---

## Environment and secrets

`.gitignore` blocks:

```gitignore
node_modules
dist, dist-ssr, *.local
.env, .env.*          (excepting !.env.example)
.catalystrc, catalyst-cli.log, .catalyst/
catalyst.json         # carries the client's Catalyst project and org IDs
backend/db/           # generated runtime store, regenerated on first run
.DS_Store, .vscode/*, npm-debug.log*
```

**Never commit Zoho or Gemini credentials, and never add a real secret to an `.env.example`.**
`backend/db/` and `catalyst.json` are ignored as *generated and client-specific*, not as secrets —
but both would leak environment detail into the repository, so neither belongs in a commit.

**Backend** (`backend/.env.example`) — every value optional, all defaulted:

| Var | Default | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | *(empty)* | Absent → keyword routing; `/health` says `"keywords only"` |
| `GEMINI_MODEL` | `gemini-2.5-flash` | |
| `AUTH_SECRET` | `neuiq-demo-secret-not-for-production` | **Required in anything resembling production** |
| `PORT` | `4200` | 4000 and 4100 belong to sibling projects |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:5174` | Explicit allow-list, never `*` |
| `NEUIQ_DB_DIR` | `backend/db` | File-store location |

**Frontend** (`frontend/.env.example`): `VITE_API_URL`, default `http://localhost:4200/api/v1`
baked into `client.js`. Only needed to point a local UI at a deployed backend. Copy to `.env.local`.

In production, Zoho OAuth and Gemini credentials belong in **Catalyst environment configuration**,
never in source.

---

## Deployment target and status

**Target:** Zoho Catalyst → Functions → **Advanced I/O**, one function named `neuiq_api` running
one Express app (not a function per route — many functions means many cold starts and the identity
middleware duplicated across each, and the moment it is duplicated one copy drifts).

**Status: not deployed.** `catalyst.json` is deliberately **not committed** — it carries the
client's Catalyst project and org IDs, which the CLI generates.

```bash
npm i -g zcatalyst-cli
catalyst login
cd backend
catalyst init          # Functions -> Advanced I/O, name it neuiq_api
```

Two things that are easy to get wrong: point the generated function at the **existing**
`functions/neuiq_api/src/` tree rather than letting the CLI scaffold over it, and swap
`platform/store.js` for the Data Store implementation.

`docs/backend/14-deployment-checklist.md` has 12 items, **all unchecked**.

---

## The Zoho OAuth model — decided 2026-09-07

**Service account for the POC.** One refresh token, one Zoho identity, reading on every caller's
behalf, with our policy layer deciding who may see what.

The decision was blocked until `data_select=ALL` returned 200 on the leave endpoint. `MINE` is
relative to whoever the token belongs to, so under a single identity it would have returned the
service account's own leave rather than the caller's — which would have made per-user OAuth
mandatory rather than optional.

**What it costs, and the two things that follow from it.** Zoho applies no narrowing under `ALL`,
so the read-time scoping in `core/policy/scope.js` is the *only* thing between an employee and the
whole organisation's leave. There is no second fence behind it. Therefore:

1. The **post-query row assertion** — verify every returned row's `employeeId` is inside the
   caller's allowed set — is required before this is wired to live data, not optional. It turns a
   scoping bug from a silent leak into a 500 with a log line.
2. Confirming **`employee_zoho_ids`** (documented, untried) is **security work, not an
   optimisation**. It restores server-side narrowing.

**Per-user OAuth is production hardening, deliberately deferred, not dismissed.** Each user
consents once, Zoho enforces authorisation natively, and ours becomes defence in depth. It needs
an authorization-code flow, encrypted per-user token storage, a re-consent path, and a decision
about a saved dashboard whose owner's grant has lapsed. `_shared/auth.service.js` is already
shaped for it — the cache key widens, the grant does not change — so it is an extension rather
than a rewrite. See the header of that file.

## Known blockers

Neither is a coding task, and neither can be worked around.

1. **`docs/backend/16-identity-authorization.md` is unwritten.** The *OAuth model* half is now
   settled (above), but the rest is not: how a caller resolves to a Zoho employee record, and the
   authorization layer scoping every tool call (self / my reports / HR-admin). It must sit
   **below** the orchestrator, because the LLM must never decide who may see what. Every guarantee
   in `15-dashboards.md` rests on it.

   Newly concrete: **leave and attendance identify employees differently** — leave takes
   `employee_zoho_ids` (erecno), attendance takes `employee_email_id` (email). There is no single
   identifier addressing both, so `AuthzContext` has to carry an email→erecno mapping. Blocked on
   a real employee-form payload.
2. **No Zoho People sandbox.** The real tool catalogue depends on the client org's actual modules,
   leave types, attendance settings and custom forms.

---

## Known technical debt

- Identity is a demo stub: no password check, no revocation, no refresh.
- No Zoho client, no OAuth token provider, no rate limiting, no caching, no retry/backoff — all
  designed (docs 05–08), none implemented.
- Per-widget caching and batched resolution with timeouts (specified in `15-dashboards.md`) are
  not implemented. On Catalyst the batching is mandatory, not nice, because of the function timeout.
- `platform/store.js`: whole-file rewrite per mutation, O(n) scan per query, no concurrent writers.
- **A clean `npm install` in `frontend/` fails `ERESOLVE`** — `vite@^8` against
  `@vitejs/plugin-react@^4`, which peers only to vite 7. The committed lockfile resolves and the
  build works; use `--legacy-peer-deps`. Real fix: `@vitejs/plugin-react@^5` or
  `@vitejs/plugin-react-oxc`.
- Chart Builder uses native `<select>`. The design system Hybrid borrows forbids them — an
  OS-drawn option list ignores the theme, visible in mono and aqua. Marked with a `ponytail:`
  comment naming the upgrade (port their `SearchSelect`).
- No chart library: bar/line/area/pie/donut are inline SVG in `shared/components/charts.jsx`
  (~80 lines against recharts' ~500KB). Add one only when a screen needs a sankey or a treemap.
- `AppContext` still carries Classic-shaped fields (`sidebarWidth`, `projTab`, `pgTab`,
  `histFilter`, `rowMenu`). Deliberately not abstracted until Modern exists — premature sharing is
  harder to unpick than duplication.
- The **Overview** screen is mock, deliberately: those figures are telemetry about *using* NeuIQ
  (chats, streaks, messages), not Zoho People data, and no event pipeline exists.
- `backend/evals/` empty; several backend scaffold directories empty; `orchestrator/llm/prompts/`
  empty while the prompts live inline.
- `SPEC_VERSION` declared in both trees but never read.
- Six docs contain stale statements — see the flags throughout this file.

---

## Pending work, in priority order

1. **Write `docs/backend/16-identity-authorization.md`** — blocks everything below it that touches
   real data.
2. **Get Zoho People sandbox access**; confirm the data-centre (`.in` vs `.com`) and the employee
   identifier each endpoint expects; finalise the real tool catalogue.
3. **Replace the demo identity stub** with the design from step 1.
4. **Build the real Zoho People client + OAuth token provider** (docs 05, 06) behind the existing
   tool interface.
5. **Reliability layer:** cache, rate limiting, retry/backoff, per-widget caching keyed on the
   caller, batched widget resolution (docs 07, 08, 15).
6. **Deploy to Catalyst**: `catalyst init`, swap `platform/store.js` for Data Store, work the
   deployment checklist.
7. Fix the vite / plugin-react peer conflict.
8. Populate `backend/evals/` and add CI running `npm run check`.
9. Correct the stale documentation flagged in this file (root README backend + Hybrid status;
   ARCHITECTURE.md routing; THEMING.md themes; the three wrong contract-mirror paths; doc 03's
   directory list; doc 09's API surface).
10. Build the Modern UI style.
11. Port `SearchSelect` to replace native `<select>` in Chart Builder.
12. Split Classic-only fields out of `AppContext` once Modern shows what it needs.
13. Write Hybrid/Modern architecture, components and theming docs.
14. Event pipeline for the Overview telemetry figures.

---

## Development conventions

**Frontend**

- **Only `shared/api/client.js` calls `fetch`.** Every request needs the bearer token attached, the
  envelope unwrapped once, and a failure that carries its status — one shared function is the only
  way to be sure.
- **Screens load data only through `useApi`.** It handles unmount, stale-response ordering, the
  three-state truth (data *or* error, never both), and the honest fallback.
- **Never `../../../` across the boundary** — use the `@shared` and `@ui` aliases (defined in
  `vite.config.js` and `jsconfig.json`).
- **What belongs in `shared/`:** state, data, routing, zero-opinion primitives — anything a
  redesign would not touch. Layout, spacing, colour and component chrome belong to a style.
  Writing the same logic in two style folders means it belongs in `shared/`; writing
  `if (uiStyle === …)` inside `shared/` means it belongs in a style folder.
- **`localStorage` reads are validated, not trusted** (a stale value would set a `data-theme` no
  stylesheet defines and the app renders unstyled with nothing in the console); writes are wrapped
  in `try/catch` because private browsing throws on `setItem`.
- **Motion:** animate `transform` and `opacity` only. Use the shared scale
  (`--ease`, `--t-fast/base/slow`). Stagger capped at six steps. Honour `prefers-reduced-motion`.
- Adding a UI style: `index.jsx` + `components/` + `pages/` + a `styles/` sheet imported by that
  entry, all seven theme token blocks and five accents, plus one line in `UI_STYLES` in
  `shared/data/appearance.js` and in `App.jsx`. Nothing outside those should need to change.

**Backend**

- **Route handlers stay thin:** parse, delegate, serialize. Every decision worth making lives in
  `orchestrator/`, `dashboards/` or `services/`, so it is testable without an HTTP request and
  reachable from more than one route.
- **Security checks go in the service, not the route** — the AI builder calls the same functions.
- **Errors carry a `status`**; anything without one is treated as a bug and returns a generic
  message with the detail logged. Never put a stack trace in a response body.
- **Refuse, don't drop.** An unknown tool parameter throws rather than being ignored — a silently
  ignored parameter means the answer is about something other than what was asked.
- **Not-understood is a first-class outcome.** A router with no clarify branch has to guess, and a
  confident wrong answer about someone's leave is worse than a question.
- Comment the *why*, in the style already present. These files explain their reasoning; match that.

---

## Files and directories not to edit casually

| Path | Why |
| --- | --- |
| `frontend/src/ui/hybrid/styles/global.css` | **Vendored byte-for-byte** (5,277 lines) from `PROJECT-BAJAJ/…/asset-management` so it can be re-synced. NeuIQ-only rules go in `neuiq.css`, which loads after |
| `frontend/src/shared/dashboards/spec.js` | Contract mirror + **must import nothing** (the test runs it under plain `node`). Changes require a matching backend change |
| `backend/.../dashboards/query.service.js` | `SOURCES` **is** the security boundary. Adding a source or field widens what the model can reach |
| `backend/.../dashboards/spec.js` | The other half of the mirror |
| `backend/.../services/zoho-people/tools/index.js` | The allow-list. Adding a tool adds an AI capability |
| `backend/.../middleware/index.js` | Token signing and caller resolution |
| `backend/.../orchestrator/index.js` | The write guard and the authorize-then-run ordering |
| `frontend/src/App.jsx` | The lazy imports are a correctness requirement, not an optimisation |
| `backend/db/dashboards.json` | Generated local state, gitignored. Not a fixture |
| `zip/zoho-people-orchestrator-poc-docs.zip` | Committed, unreferenced, purpose undocumented. Leave it alone |
| Anything `catalyst*` | Deliberately uncommitted; carries client project/org IDs |

---

## Git safety rules

- **Commit or push only when explicitly asked.** Never push, force-push, amend, rebase, reset
  `--hard`, or `checkout --` over uncommitted work without being asked.
- **Never commit secrets.** `.env`, tokens, Zoho or Gemini keys, `catalyst.json`, `.catalystrc`.
  If you find one staged, stop and say so.
- **A large amount of working code is currently untracked.** The entire backend implementation
  (`app.js`, `orchestrator/`, `dashboards/`, `seed.js`, `tools/`, `server.js`, `tests/check.mjs`),
  `frontend/src/shared/api/`, `frontend/src/shared/dashboards/`, `scripts/`, the root
  `package.json` and both `.env.example` files are untracked or staged-but-modified. **Do not run
  `git clean`, `git checkout .`, or `git reset --hard`** — they would destroy work that exists
  nowhere else.
- **Do not commit `node_modules/`, `dist/` or `backend/db/`.**
- If on the default branch (`main`) and asked to commit, branch first.
- Do not skip hooks (`--no-verify`) or bypass signing.

---

## Documentation map

| Path | What it covers | Trust |
| --- | --- | --- |
| `backend/README.md` | The running backend, its four properties, layout, blockers | **Current** |
| `frontend/README.md` | The three styles, structure, config, snags | **Current** |
| `docs/frontend/00-overview.md` | Whole frontend in one pass — best starting point | **Current** |
| `docs/frontend/API-INTEGRATION.md` | Client, `useApi`, fallback rules, screen→endpoint map | Current except the `spec.js` path |
| `docs/frontend/UI-STYLES.md` | Three layouts, seven themes, adding a fourth | **Current** |
| `docs/backend/15-dashboards.md` | Storage, DSL, sanitize, read-time scoping | Design-current; written before the backend existed, and parts are still ahead of it |
| `docs/backend/README.md` | Reading order, the four rules, the blockers | Current except its "designed, not built" status line |
| `docs/backend/00–14` | The original POC specification | **Pre-pivot.** Aspirational for 05–08; 03 and 09 are outdated |
| `docs/frontend/{ARCHITECTURE,COMPONENTS,THEMING}.md` | Classic UI only | **Stale** on routing and theming |
| Root `README.md` | Repo orientation | Stale on backend and Hybrid status |

**When these docs and the code disagree, the code is right — it runs and it has tests.**

Two shipped reference implementations exist elsewhere in this workspace, both named in
`docs/backend/README.md`: `PROJECT-NEXGEN/apps/api/src/modules/` (NestJS orchestrator, tool
registry, Gemini + keyword fallback, read-only query service — the direct ancestor of this design)
and `PROJECT-BAJAJ/PROJECT-BAJAJ-CATALYST/asset-management/` (the design system Hybrid vendors).
