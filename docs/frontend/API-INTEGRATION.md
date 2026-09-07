# Frontend — Talking to the backend

How the UI gets its numbers. Read this before adding a screen that loads data, or before changing
anything in `shared/api/`.

The short version: **one client, one hook, and every caller has an honest offline fallback.**

---

## The three files

```
shared/api/
├─ client.js     the only place that calls fetch()
├─ hooks.js      useApi() — the only place a screen calls the client from
└─ index.js      one import path: `import { api, useApi } from '@shared/api'`
```

Nothing else in the app calls `fetch`. That is not tidiness — three things have to be true on
every request, and one shared function is the only way to be sure they are:

1. **The bearer token is attached.** Forget it on one call and you get a 401 that looks like a bug
   in that screen rather than a missing header.
2. **The envelope is unwrapped once.** The server answers `{requestId, success, ...body}`. Screens
   see `body` and never have to decide what `success: false` means.
3. **A failure carries its status.** `403` (not allowed), `404` (gone) and a network error (server
   down) want three different things on screen, and only the status tells them apart.

---

## Loading data in a screen

```jsx
import { useApi, api } from '@shared/api';

const { data, loading, error, source, reload } = useApi(
  (signal) => api.analyticsSummary({ signal }),   // the call
  [],                                             // re-run when these change
  { fallback: () => ({ kpis: SAMPLE_KPIS }) },    // offline only
);

if (loading) return <Skeleton />;
if (error)   return <Failed error={error} />;
return <Kpis rows={data.kpis} sample={source === 'sample'} />;
```

`useApi` exists rather than each screen writing its own `useEffect` + fetch because four things
are easy to get wrong and are wrong the same way every time:

- **Setting state after unmount.** It aborts on cleanup and ignores late arrivals.
- **The stale response.** Change a filter twice quickly and the first response can land after the
  second. Each run is tagged; a superseded run's result is dropped.
- **The three-state truth.** A screen keeping stale `data` beside a fresh `error` shows two
  contradictory things at once. A run either replaces the data or records the error.
- **Honest fallback.** `source` is `'api'` or `'sample'`, and the UI is expected to say which.

### `source` is not optional decoration

Every figure in this product is somebody's leave or hours. A fallback indistinguishable from live
data is worse than an error message, so anything showing sample data is labelled:

| where | how it says so |
| ----- | -------------- |
| a widget | a `sample` pill in the card header |
| a chat answer | a `sample` pill and the tool name under the bubble |
| the AI tab | a `sample` pill beside the page title |
| Settings → Account | `API: Unreachable` and `Data: Local sample data` |

### Only an unreachable server earns the fallback

A `403` is a **real answer** — "you may not see this" — and showing sample numbers in its place
would be a lie about someone's permissions. `useApi` falls back only on `err.offline`, which is
set exclusively when the request never reached the server. Everything else surfaces as itself:

```
Not available on your account.        ← 403, in the tile
Could not load this widget.           ← anything else
```

---

## Where each screen gets its data

| screen | endpoint | fallback |
| ------ | -------- | -------- |
| Chat (both UIs) | `POST /chat` | `mockData.answerFor()`, labelled |
| kpi tile | `GET /analytics/summary` | `SAMPLE_KPIS` |
| any chart tile | `POST /query` | `sampleQuery()` from the sample row table |
| AI tab | `GET /ai/capabilities` | the client source registry, non-admin scope |
| Chart Builder pickers | `GET /dashboards/meta` | `schemaFor({isAdmin: false})` |
| AI Dashboards, Reports | `GET /dashboards` + CRUD | `SEED_DASHBOARDS`, edits stay local |
| AI build | `POST /dashboards/build` | `sampleBuild()`, keyword matching |
| Sign-in | `POST /auth/login`, `GET /auth/users` | a local session, toast says so |
| Dashboard (Overview) | — | mock, deliberately: this is NeuIQ usage telemetry, and no event pipeline exists yet |

---

## The client contract mirror

`ui/hybrid/lib/spec.js` holds a **copy** of the backend's `SOURCES` registry, `sanitize()` and
`cleanWidgets()`. Two questions this raises, answered:

**Why duplicate it?** So the Chart Builder can reject an invalid combination while you are still
choosing it, not after a round trip. The server whitelists again on arrival and *that* copy is the
one that matters; this one is a courtesy to the person building the chart.

**Why is it a separate file from `dashboards.js`?** Because `spec.js` imports nothing — no React,
no API client, no build aliases. That is what lets `test/dashboards.check.mjs` run it under plain
`node`, and the whitelist is the one part of this feature that most deserves a test which cannot
be skipped for want of a bundler.

```bash
cd frontend && npm run check      # 27 assertions over the contract
```

Any change to `SOURCES`, `sanitize` or `cleanWidgets` must be made in **both**
`frontend/src/ui/hybrid/lib/spec.js` and `backend/.../dashboards/` — the comments in each point at
the other.

---

## Session and identity

`AppContext` owns it:

- `user` — the signed-in employee **as the server describes them**. `user.isAdmin` decides whether
  admin-only sources appear in the Chart Builder, and it has to be the backend's answer: a
  client-side role would let the picker offer a source that 403s on resolve, which reads as a
  broken app rather than as a permission boundary.
- `demoUsers` — from `GET /auth/users`, rendered as the account picker on the sign-in screen.
  Which account you pick changes every number in the app, so the picker is the fastest way to see
  the scoping work.
- The token lives in `localStorage` and is restored on load by calling `GET /me` — not by decoding
  the token, because a token minted before a role change would otherwise keep the old permissions
  alive in the UI until it expired. A `401` clears it.

### Chat

`send()` posts to `/chat` with the **last six turns** — enough for the orchestrator to resolve
"and last month?", not the whole transcript. In a private (incognito) chat it sends no history at
all.

The answer text is written by the backend tool that fetched the data, never assembled on the
client. The moment `send()` starts composing sentences out of `res.data`, the guarantee in
[`docs/backend/04-orchestrator.md`](../backend/04-orchestrator.md) is gone.

The typing effect is **presentation, not a stream**: the whole answer is already in hand, so
`stop()` can interrupt it safely and keeps what has been shown. `stop()` also aborts the request,
so a slow answer cannot land after you asked it to stop.

### Pinning an answer

When the backend says a question has a chartable equivalent it returns `pinnable`, and the bubble
grows a **Pin as widget** button. The tile stores the *question*, with relative parameters — so it
re-resolves against your own permissions every time it is opened and stays current. Pinning the
figure that was on screen would freeze a value that has already escaped whoever's access produced
it.

---

## Adding an endpoint

1. Add a named helper to `api` in `client.js`. Name it after what it answers, not after its path,
   so a route change touches one line.
2. Call it through `useApi` in the screen. Pass `signal` so navigation aborts it.
3. Decide the fallback. If there is no honest one, pass no `fallback` — an error state is better
   than invented data.
4. If it returns figures, label the `source` in the UI.
