# NeuIQ — Backend

Orchestrator for the conversational layer over Zoho People, plus the store behind
on-demand dashboards.

> **Status: running, on seeded data.** A plain Express app you can start with
> `npm run dev` — orchestrator, tool registry, query engine, dashboard CRUD and a
> demo identity layer are all implemented and covered by `npm run check`.
>
> What it is **not** yet: connected to Zoho People (no sandbox — see
> [Open blockers](#open-blockers)), and not deployed to Catalyst (`catalyst.json`
> is not committed). Every figure it returns comes from a deterministic seed in
> `src/services/zoho-people/seed.js`.

## Running it

```bash
cd backend
npm install
npm run dev          # http://localhost:4200, restarts on change
npm run check        # 65 assertions, no framework, exit 1 on failure
```

Or from the repo root, `npm run dev` starts the API and the frontend together.

Nothing needs configuring to run. `.env` is optional and every value has a
default — copy `.env.example` if you want to change the port, add a Gemini key, or
set a real `AUTH_SECRET`.

### Signing in

There are five seeded accounts, and **which one you use changes every number the
API returns**, because every read is scoped to the caller:

| username | role     | what they can read                          |
| -------- | -------- | ------------------------------------------- |
| `alex`   | employee | their own leave and attendance only         |
| `priya`  | employee | their own leave and attendance only         |
| `rohit`  | manager  | their own, plus their direct reports'        |
| `arjun`  | manager  | their own, plus their direct reports'        |
| `meera`  | hr_admin | the whole organisation, including headcount |

```bash
TOKEN=$(curl -s -X POST localhost:4200/api/v1/auth/login \
  -H 'content-type: application/json' -d '{"username":"alex"}' | jq -r .token)

curl -s localhost:4200/api/v1/chat -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"message":"how much casual leave do I have left?"}' | jq .answer
```

The same `POST /query` with `{"source":"leave","metric":"count"}` returns **9** for
`alex` and **276** for `meera`. That difference is the whole point of the design, and
it is enforced in one place — see [Scoping](#scoping-happens-at-read-time).

## Endpoints

All under `/api/v1`. Everything except `/health` and the two `/auth` routes needs
`Authorization: Bearer <token>`.

| method             | path                       | what it does                                     |
| ------------------ | -------------------------- | ------------------------------------------------ |
| `GET`              | `/health`                  | liveness, plus whether a model is configured     |
| `GET`              | `/auth/users`              | the seeded accounts, for the sign-in screen      |
| `POST`             | `/auth/login`              | `{username}` → a token                           |
| `GET`              | `/me`                      | the caller, as the server sees them              |
| `POST`             | `/chat`                    | `{message, history}` → a grounded answer         |
| `GET`              | `/ai/capabilities`         | the tool allow-list and readable sources         |
| `POST`             | `/query`                   | resolve one widget spec                          |
| `GET`              | `/analytics/summary`       | the headline numbers a kpi tile reads            |
| `GET`/`POST`       | `/dashboards`              | list / create                                    |
| `PATCH`/`DELETE`   | `/dashboards/:id`          | rename or replace widgets / delete               |
| `POST`             | `/dashboards/:id/duplicate`| copy                                             |
| `POST`             | `/dashboards/build`        | `{prompt}` → a spec, nothing saved                |
| `GET`              | `/dashboards/meta`         | widget types and the sources **you** may read    |

Every response carries a `requestId`, in the body and in the `x-request-id` header,
matching one structured log line on the server.

## The four properties that decide the code

### The model never produces business data

It returns a **tool name and arguments**. The tool fetches, and the tool's own
`say()` writes the sentence. So a wrong figure is a code bug, not a hallucination,
and it is reproducible.

`orchestrator/llm/gemini.js` is entirely optional — with no `GEMINI_API_KEY` the
keyword router in `orchestrator/index.js` handles everything and `/health` reports
`"keywords only"`. A model outage degrades to keywords with a log line, never a 500.

### Authorization sits below routing

`mayCall` and each tool's own subject check run **after** the model has chosen. A
model talked into asking for someone else's records still gets a 403. Writes are
refused ahead of both routers by an explicit guard — every tool is read-only, so
nothing *can* change a record, but `"delete all leave records"` contains the word
"leave" and the keyword router would otherwise match it to the read tool and answer
confidently. That was caught by a test, and it is why there are two independent
refusals.

### Scoping happens at read time

`dashboards/query.service.js` holds a `SOURCES` registry, and **that registry is
the security boundary**. Each source declares `scope(employeeId)` — the filter that
pins it to one person. A source whose `scope` is `null` has no owner field, so there
is no safe slice of it and it is admin-only *by construction* rather than by a check
somebody has to remember to write.

`runQuery` pushes the ownership filter on **before** running. It lives in the query
service and not in the route, because the AI builder calls the same function.

### A widget stores the question, never the answer

`{type, title, query}` persists; the value is resolved on every read. A stored
number has already escaped whoever's permissions produced it — so a dashboard saved
by an HR admin and opened by an employee returns the employee's rows, and the
figures are current rather than frozen at pin time.

The query DSL is **a menu, not a parser**: `sanitize()` whitelists every field
against the registry, in both directions (model output *and* client saves). There is
no SQL, no ZCQL and no write path. See
[`docs/backend/15-dashboards.md`](../docs/backend/15-dashboards.md).

## Layout

```
backend/
├─ functions/neuiq_api/src/
│  ├─ app.js                     # every route, thin: parse, delegate, serialize
│  ├─ middleware/index.js        # request-id, logger, authenticate, errors
│  ├─ orchestrator/
│  │  ├─ index.js                # write guard -> route -> authorize -> run -> format
│  │  └─ llm/gemini.js           # optional; router and builder prompts
│  ├─ services/zoho-people/
│  │  ├─ seed.js                 # deterministic dataset (50 employees)
│  │  └─ tools/index.js          # the allow-list: 6 read-only tools
│  ├─ dashboards/
│  │  ├─ query.service.js        # SOURCES registry, sanitize, runQuery
│  │  ├─ spec.js                 # cleanWidgets, cleanTitle
│  │  └─ builder.js              # keyword fallback, scope-aware
│  └─ platform/store.js          # wraps the store so the SDK is swappable
├─ tests/check.mjs               # 65 assertions
└─ evals/                        # labelled utterance -> expected tool
```

Three structural decisions worth knowing:

**`platform/store.js` wraps persistence.** `zcatalyst-sdk-node` only works inside the
Catalyst runtime; imported directly, the app could not run or be tested on a laptop.
Wrapped once with a file-backed implementation, everything runs locally and the
Catalyst version is a drop-in. Every method takes `ownerId` first, and `findMine`
looks up owner and id *together*, so another user's row is a 404 rather than a 403 —
a 403 would confirm the row exists.

**`dashboards/` is its own module.** Not a Zoho service, not the orchestrator — it
composes both.

**`orchestrator/llm/prompts` are versioned, not string constants.** The system prompt
and tool descriptions decide routing accuracy more than any other code here, so they
need to be diffable.

`agents/` and `controllers/` from the original plan in
[`docs/backend/03-project-structure.md`](../docs/backend/03-project-structure.md) are
dropped — with a tool registry and thin routes, both are empty layers.

## Deploying to Catalyst

`catalyst.json` is deliberately not committed: it carries the client's Catalyst
project and org IDs, which the CLI generates.

```bash
npm i -g zcatalyst-cli
catalyst login
cd backend
catalyst init            # Functions -> Advanced I/O, name it neuiq_api
```

Point the generated function at the existing `functions/neuiq_api/src/` tree rather
than letting the CLI scaffold over it, and swap `platform/store.js` for the Data
Store implementation.

## Open blockers

1. **Identity is a labelled demo stub.** `middleware/index.js` signs an HMAC token,
   so a client cannot forge a role by editing a header, and the role is read fresh
   from the dataset rather than trusted from the token. But there is no password
   check, no revocation and no refresh. It exists to establish *which Zoho employee
   the caller is*, because every guarantee above rests on that — building against a
   stub is fine, shipping it is not. The real design is
   `docs/backend/16-identity-authorization.md`, still unwritten.
2. **No Zoho People sandbox.** The tool catalogue is decided by which modules, leave
   types and custom forms the org actually has. Until that exists, the tools are
   modelled on the documented API shapes and fed by `seed.js`.
