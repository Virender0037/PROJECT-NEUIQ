# 17 — Environments, organisation isolation and the shared employee snapshot (E2.2)

Status: **implemented locally, synthetic-tested, not live-validated beyond the 2-employee `.com`
test organisation.** Written 2026-10-14. When this document and the code disagree, the code wins —
it runs and it has tests.

## 1. Environments

One validated, frozen **environment profile** per process
(`backend/functions/neuiq_api/src/core/platform/environment.js`). `server.js` resolves it **before
loading the app**; `createApp()` resolves the same profile again — the same function, the same
integration checks — so no entry point can start with a combination another would refuse.

| `NEUIQ_ENV` | Data source | Sign-in | `NODE_ENV` | Required | Namespace |
| --- | --- | --- | --- | --- | --- |
| `dev` (or unset) | seed **only** | demo, or zoho (+ real `AUTH_SECRET`) | not production | — | `dev/seed` |
| `test` | zoho **only** | zoho | not production | `ZOHO_DC`, `NEUIQ_ORG_KEY`, real `AUTH_SECRET`, `ZOHO_*` credentials | `test/zoho-<dc>/<org key>` |
| `prod` | zoho **only** | zoho | `production` (and production ⇒ `prod`) | as test | `prod/zoho-<dc>/<org key>` |

Refused at startup, with a one-line sanitised reason and no stack trace:

- an unknown `NEUIQ_ENV`, `NEUIQ_AUTH_MODE` or `ZOHO_DC` (values clipped, never echoed whole);
- `NEUIQ_ENV` unset over live data; `dev` over live data; `test`/`prod` over seed;
- `NODE_ENV=production` without `NEUIQ_ENV=prod`, and `prod` without `NODE_ENV=production`;
- demo sign-in anywhere but dev over seed (E1 rules, unchanged and checked first);
- live Zoho without `ZOHO_DC` — **there is no default data centre any more**;
- live Zoho without a valid `NEUIQ_ORG_KEY` (3–40 lower-case letters, digits, inner hyphens);
- any `NEUIQ_HR_ADMIN*` setting — roles do not exist until E3; a setting that looks as if it works,
  or could be copied into another organisation's deployment, is refused instead;
- a missing, demo-default, short (< 32), placeholder-looking or low-variety `AUTH_SECRET` wherever
  it could protect non-demo sign-in (zoho mode, `test`, `prod`). Demo dev is unaffected.

## 2. Data centre and OAuth validation

- `ZOHO_DC` drives both the OAuth host (`accounts.zoho.<dc>`) and the People host. Required for live
  data; `datacenters.js` functions take the code as a required argument.
- **Token `api_domain` allow-list:** every token response must carry exactly the allow-listed
  `api_domain` for `ZOHO_DC` (`https://www.zohoapis.com` for `com` — the only one observed; others are
  Zoho's documented pattern, marked unverified). A mismatch (`API_DOMAIN_MISMATCH`) or a missing domain
  (`API_DOMAIN_MISSING`) is a 503; the token is **not cached and not used**, and neither the token nor
  the received domain is logged or echoed.
- Tokens live in memory only, keyed by DC inside a provider that belongs to one process — and one
  process serves one deployment (§4), so a token can never be served across environments.
- **E5 compatibility:** the same table gives E5 its expected `iss` host (accounts host per DC) and
  its multi-DC refusal (`location` / `accounts-server` must equal `ZOHO_DC`).

## 3. Organisation boundary — what is and is not established

**Not established: which Zoho organisation the credentials belong to.** Zoho's documented OIDC ID
token has no organisation claim; the People API documents no organisation-details endpoint or scope;
the token response carries only `api_domain`. A matching employee record is **not** proof (an
erecno is not shown to be unique across organisations), so no employee-anchor check was built and
`organisationVerification` is always `'unresolved'` for live data — never `true`.

What E2.2 does instead — independent isolation that does not depend on that proof:

| Control | Effect |
| --- | --- |
| **Deployment namespace** `env/zoho-<dc>/<NEUIQ_ORG_KEY>` | Every cache key, the employee snapshot, the dashboard store and (E4) sessions are partitioned by it |
| **One process, one namespace** (`core/platform/deployment.js`) | `createApp()` binds it; rebinding to another namespace throws; live reads before binding are refused (503) |
| **Credential fingerprint** (sha256 of `zoho-people:<dc>:<client id>`, 16 hex) | Recorded in each store partition's marker: reopened with other credentials → refused; another partition already created with the same credentials → refused |
| **HR-admin settings refused until E3** | Nothing organisation-specific can silently apply in the wrong deployment |

**Production blocker — what resolves it:** one of (a) Zoho confirms an organisation-identifying
API/scope or token claim, which would then be checked against a configured expected value; or
(b) E7's supervised sign-in shows the ID token or callback identifies the organisation. Until then,
production sign-in (E5) must not treat any organisation as verified; the client must also confirm
in writing which organisation is production and create **separate** credentials per environment
inside that organisation.

## 4. The shared employee snapshot (cache architecture)

`integrations/zoho/people/employeeSnapshot.js` — ONE organisation-wide employee list per process,
shared by **every** consumer:

| Consumer | Before E2.2 | Now |
| --- | --- | --- |
| E2 identity directory | own load, 5 min | indexes the shared snapshot; index rebuilt only when the snapshot object changes |
| live `employees` query source | own walk per admin per 5 min | reads the snapshot (no per-caller copy) |
| live `headcount` | **a full walk on every call** | reads the snapshot |
| live `employeeLookup` | **a full walk on every call** | reads the snapshot |

Rules (moved intact from E2, now in one place):

| Situation | Behaviour |
| --- | --- |
| fresh (< TTL) | served from memory, no request |
| expired or none | **one** load; concurrent callers share it (single-flight) |
| expired | dropped **before** reloading — never served during or after a refresh |
| load fails | every waiter gets the failure; **30 s cool-down** refuses further calls **without a request** |
| `invalidate()` | drops the snapshot; a load already running is not kept, and later callers do not join it |
| malformed / > 10,000 rows | never stored |
| another namespace | dropped, never served (consumers also assert the namespace) |

- **TTL:** 5 minutes (a longer configuration is clamped down). This is the pre-existing E2 value,
  kept; it is **not** a client-approved freshness requirement — confirm before production.
- **Errors** reach consumers as `EmployeeSnapshotError` with a status and code only — a real 403
  stays 403, 429 stays 429, everything else is 503. Zoho's error text never reaches a response or log.
- **Rows are frozen**; consumers transform into new allow-listed objects and never return the
  snapshot to a client.
- **The snapshot grants nothing.** It is organisation-wide and server-side; every consumer applies
  the caller's reach **before** reading (`employees` is adminOnly — refused by the query engine;
  `headcount` is admin-only via `mayCall`; `employeeLookup` runs `teamOf` first). Live team scope stays
  off until E3. Per-caller results (leave, leave balance) are cached under
  `scopedCacheKey(namespace, caller, …)`; the old `'anonymous'` fallback key is gone (a request with
  no caller id is a 401).
- **Single instance only.** Each process holds its own snapshot and walks independently. On N
  Catalyst instances: N walks per TTL and N× the daily estimate below. Horizontal scaling needs a
  shared snapshot store (Catalyst Cache) **plus** a refresh lease/lock so only one instance walks,
  with every key under the namespace prefix. Not built — needs approval.

## 5. Dashboard store isolation

`core/platform/store.js`, partitioned by namespace:

- `dev/seed` keeps the **pre-E2.2 path** `<db>/dashboards.json` — existing local dashboards keep
  working with **no migration**; nothing is moved, copied or deleted.
- Every other namespace gets `<db>/ns/<namespace with / as __>/` — so Zoho test/production never open
  the demo file and never see seed-owned dashboards.
- Each directory holds `.namespace.json` (namespace + credential fingerprint). A marker naming another
  namespace, other credentials, credentials shared with another namespace, or unmarked data in a live
  partition → **refused at startup**.
- An **unreadable** file used to be replaced by "start empty" (and the next save destroyed it). It now
  refuses reads and writes (503 `STORE_UNREADABLE`) and is never overwritten.
- `NEUIQ_DB_DIR` is read when a collection is opened, so tests never write into a real `backend/db`.
- **Catalyst Data Store compatibility:** a `namespace` column indexed with `ownerId`, filtered on every
  query, and a per-namespace metadata row enforcing the same marker rules.

## 6. Scalability — measured (synthetic) and estimated

Measured by `backend/tests/scale.check.mjs` (real paged client, snapshot and directory against a
fake Zoho serving the recorded page shape with real 18-digit ids; one Windows laptop run, 2026-10-14;
timings vary by hardware; **not** live validation):

| Employees | Requests / load | Load + parse | Index build | Retained heap | `resolveZuid` | `reportsOf` |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 1 | 98 ms\* | 1.3 ms | 2.2 MB\* | 2.4 µs | 2.0 µs |
| 200 | 2 | 7 ms | 1.2 ms | 0.2 MB | 2.4 µs | 1.7 µs |
| 500 | 3 | 15 ms | 1.6 ms | 0.4 MB | 1.6 µs | 1.7 µs |
| 1,000 | 6 | 25 ms | 3.2 ms | 0.5 MB | 1.6 µs | 2.1 µs |
| 5,000 | 26 | 111 ms | 13 ms | 3.3 MB | 1.9 µs | 2.1 µs |
| 10,000 | 51 | 230 ms | 31 ms | 4.8 MB | 1.7 µs | 2.3 µs |

\* first load in the process — JIT and module warm-up, not the cost of two employees.

Asserted at every size: `ceil(n/200)` requests (+1 end-of-list read on an exact multiple of 200),
200 concurrent cold callers → one load, 20,000 warm lookups → zero requests. At 1,000 and 10,000: a
failed middle page → `UNAVAILABLE` (no partial data), zero requests during the cool-down, recovery.
10,000 exactly loads (51 requests); 10,001 is refused whole.

**Bottleneck found:** at 10,000 employees one walk needs the whole local page budget (51/min). After
a failed walk, the first retry inside the same minute is refused locally (no Zoho call); recovery
waits for the limiter window, not just the 30 s cool-down. Safe; slower. Raising the budget needs
Zoho's real per-minute limit for `getRecords`, which is undocumented.

**Estimated daily Zoho calls** (estimate — demand at least once per TTL all day, one instance, +~24
token refreshes; all four consumers share the one snapshot):

| Employees | Per load | TTL 5 min | TTL 15 min | TTL 60 min |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 1 | 312 | 120 | 48 |
| 200 | 2 | 600 | 216 | 72 |
| 500 | 3 | 888 | 312 | 96 |
| 1,000 | 6 | 1,752 | 600 | 168 |
| 5,000 | 26 | 7,512 | 2,520 | 648 |
| 10,000 | 51 | 14,712 | 4,920 | 1,248 |

Zoho publishes plan-wide daily API limits (e.g. Essential HR "250 calls/user License Max : 5000
calls/day"; Enterprise "500 calls/user License Max : 25000 calls/day"), not a `getRecords` limit. At
the current 5-minute TTL (288 × requests-per-load + 24), organisations above ~3,400 employees
(18+ pages per load) would exceed a 5,000/day plan with the employee list alone, before any leave
or balance calls — and a smaller organisation still shares that daily budget with them. **The production TTL must be agreed with
the client against their plan.** Multiple instances multiply these figures.

## 7. Configuration before running the `.com` test organisation in the app

```
NEUIQ_ENV=test
NEUIQ_DATA_SOURCE=zoho
NEUIQ_AUTH_MODE=zoho
ZOHO_DC=com
NEUIQ_ORG_KEY=<label, e.g. fristine-test>
AUTH_SECRET=<node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))">
ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN (already present locally)
```

The local `backend/.env` was **not** changed by E2.2; it stays a seed/demo dev configuration and
still starts unchanged. In zoho mode nobody can sign in until E5.

## 8. Compatibility with E3, E4, E5

- **E3 (roles):** derive roles only from the namespace's shared snapshot; bind the HR-admin list to the
  namespace (the profile currently refuses it outright); never treat `organisationVerification` as
  verified.
- **E4 (sessions):** session records carry the namespace and are refused in any other; the session
  store is partitioned like the dashboard store; signing keys differ per environment (S7 enforces a
  real one).
- **E5 (Zoho sign-in):** check the ID token `iss` and callback `accounts-server` against `ZOHO_DC`
  (table in `datacenters.js`), keep multi-DC off, map `sub` (ZUID) only through the namespace's
  directory, and refuse production sign-in while organisation verification is unresolved.

## 9. Unresolved risks

1. Organisation identity is unverifiable with documented Zoho APIs (§3) — **production blocker**.
2. Single-instance caching (§4) — horizontal scaling unsolved.
3. Paging is unverified against more than 200 **live** employees; a misplaced Zoho 7024 after a full
   page cannot be distinguished from the real end (E2.1).
4. Production TTL and daily API budget unconfirmed (§6).
5. Credential-fingerprint checks only see store partitions under the **same** `NEUIQ_DB_DIR`; two
   machines sharing credentials are not detected.
6. Only the `.com` `api_domain` has been observed; the others are documented patterns.

## 10. Recorded requirement — AI provider

NeuIQ's runtime chatbot AI provider will be the **Claude API exclusively**; Gemini is to be retired
in a separate AI-provider migration milestone. E2.2 did not touch the AI code: `core/ai/gemini.js`
is unchanged and still the runtime provider today.
