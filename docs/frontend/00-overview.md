# Frontend — How It Works

Start here. This explains the whole frontend in one pass: what runs, what is shared, and where to
put a change. Read it before touching code and you should not need to guess at anything.

For deeper detail:
[API-INTEGRATION.md](API-INTEGRATION.md) (how screens get their numbers) ·
[UI-STYLES.md](UI-STYLES.md) (the three layouts + theming) ·
[ARCHITECTURE.md](ARCHITECTURE.md) / [COMPONENTS.md](COMPONENTS.md) / [THEMING.md](THEMING.md)
(Classic-specific).

---

## Running it

```bash
cd frontend
npm install --legacy-peer-deps   # see "Known snags" below
npm run dev                      # http://localhost:5174
npm run check                    # 27 assertions over the widget contract
npm run build
```

Add `?ui=hybrid` to the URL to open a specific layout. It is remembered afterwards.

The frontend needs the API for real figures. From the repo root, **`npm run dev` starts both** —
the API on 4200 and the UI on 5174. Without the backend the app still runs end to end on local
sample data, clearly labelled as such; see
[API-INTEGRATION.md](API-INTEGRATION.md#source-is-not-optional-decoration).

---

## The one idea to hold on to

**Three UI styles over one brain.**

There is exactly one copy of the app's state, data and routing. On top of that sit three
interchangeable presentation layers — Classic, Hybrid and Modern — each owning its own shell,
components and stylesheet. None of them owns a fact.

```
                     ┌──────────────────────────────┐
   URL  ───────────► │  shared/                     │
                     │    routes.js   the route table
   localStorage ───► │    AppContext  all state + actions
                     │    theme.js    7 themes, 5 accents
                     │    data/       mock content + seeds
                     └───────────┬──────────────────┘
                                 │  useApp()
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
        ui/classic/         ui/hybrid/         ui/modern/
        chat-first          data workspace     (stub)
        <El> inline         global.css
```

If you find yourself writing the same logic in two style folders, it belongs in `shared/`. If you
find yourself writing `if (uiStyle === …)` inside `shared/`, it belongs in a style folder.

---

## What runs, in order

1. **`index.html`** loads fonts and `src/main.jsx`.
2. **`main.jsx`** mounts `<BrowserRouter>` → `<AppProvider>` → `<App>`. The router is outside the
   provider because the provider reads the URL.
3. **`App.jsx`** picks the UI style and lazy-loads it.
4. **The style's `index.jsx`** applies the theme, draws its shell, and renders the screen for the
   current `view`.

### Why the styles are lazy-loaded

Not for bundle size. Hybrid's stylesheet styles bare `html`, `body` and `table` — imported
statically it would restyle Classic too, whichever style was actually mounted. `React.lazy` ties
each stylesheet to its own chunk so only the active one loads. The build shows it working:
`classic.css` and `hybrid.css` are separate assets.

---

## Routing — the URL owns the screen

`shared/lib/routes.js` is the only route table.

```js
VIEW_PATH = { chat: '/chat', dashboard: '/dashboard', custom: '/analytics/dashboards', … }
pathToView('/analytics/dashboards')  // -> 'custom'
```

Screens never read the URL. They call `app.go('dashboard')` and read `app.view`, and the context
derives `view` from `useLocation()`. That is why adopting the router changed no screen code.

Two things worth knowing:

- **`empty` and `chat` share `/chat`.** They were never two destinations, only "does this
  conversation have messages yet" — decided in each shell from `messages.length`.
- **The three analytics tabs are three routes** (`/analytics/reports`, `/analytics/chart-builder`,
  `/analytics/dashboards`) **sharing one shell.** Deep links keep working, but switching between
  them is a tab, not a trip back out to the dock.

### Adding a screen

1. Add a `view` key and path to `VIEW_PATH` and `PATH_VIEW` in `routes.js`.
2. Write the page in `ui/<style>/pages/`.
3. Render it in that style's `index.jsx`.
4. Add it to the style's nav model if it should be reachable from the sidebar.

A route with no screen in a given style renders that style's fallback, not a blank pane — Classic
maps the analytics views onto its own widget grid this way.

---

## State — `shared/context/AppContext.jsx`

One provider holds everything and exposes actions. Components call `useApp()`; nothing is
prop-drilled and no screen keeps its own copy of shared state.

| Group | What it holds |
| ----- | ------------- |
| Navigation | `view` (derived from URL), `go`, `newChat`, `loadConvo`, `toggleIncognito` |
| Appearance | `theme`, `accent`, `uiStyle` + setters — **all three shared across styles** |
| Chat | `messages`, `composer`, `thinking`, `streaming`, `streamText`, `send`, `stop` |
| Auth gate | `landing`, `authed`, `authView`, `enterAuth`, `doAuth`, `logout` |
| Preferences | `prefs`, `density`, `togglePref`, `toggleDensity` |
| Screen-local UI | `settingsTab`, `projTab`, `pgTab`, `histFilter` |

Two conventions that matter:

- **`localStorage` reads are validated, not trusted.** A stale value from an older build would
  otherwise set a `data-theme` no stylesheet defines, and the app would render unstyled with
  nothing in the console explaining why. Writes are wrapped in `try/catch` because private
  browsing throws on `setItem`.
- **Screen-only state stays in the screen.** The Tasks checkboxes use local `useState` — nothing
  else needs to know which boxes are ticked.

### The known wart

`AppContext` still carries a few Classic-shaped fields — `sidebarWidth`, `projTab`, `pgTab`,
`histFilter`, `rowMenu`. They are deliberately not abstracted yet: splitting them before the
Modern style exists would be guessing at what it needs, and premature sharing is harder to unpick
than duplication.

---

## Theming — `shared/lib/theme.js`

A **theme** is a palette. A **UI style** is a layout. They are independent, so switching style
keeps your theme and vice versa.

Seven themes ride on two attributes instead of seven stylesheets:

```
data-theme    light | dark | mono | aqua    which component rules apply
data-variant  dim | mono | aqua             re-tints the base tokens on top
data-accent   blue | red | green | ochre    the accent colour
```

So `dim` is `data-theme=dark` + `data-variant=dim`: it reuses every dark rule and only shifts the
base colours. Without that, mono-dark and aqua-dark would each need a full copy of the dark
stylesheet, and the three would drift apart the first time one was edited.

`applyTheme(theme, accent)` writes all three to `document.documentElement` and **returns a
cleanup function**. Each style calls it from one effect. The cleanup is not optional: when you
switch style, that style's stylesheet unloads, and leaving its attributes behind would style the
next one with tokens it never defined.

Adding a theme means editing `theme.js` plus the token block in each style's stylesheet. Both
Settings screens pick it up automatically, because they read their options from
`shared/data/appearance.js`.

---

## Motion

Both styles define the same scale and use nothing else:

```css
--ease: cubic-bezier(.32,.72,0,1);   /* ease-out, no overshoot */
--t-fast: .12s   --t-base: .2s   --t-slow: .34s
```

Three rules:

1. **Animate `transform` and `opacity` only.** Both composite off the main thread. Animating
   `height`, `top` or `width` forces layout every frame, which is what makes a UI feel stiff.
2. **Screens rise once on navigation.** The wrapper is keyed on `view`, so it replays on every
   navigation rather than only on first mount. Grids and lists stagger behind it, capped at six
   steps — past that the last item arrives late enough to feel broken.
3. **`prefers-reduced-motion` kills all of it.** Vestibular triggers are an accessibility
   failure, not a preference.

---

## Data

| File | What it is |
| ---- | ---------- |
| `shared/data/mockData.js` | Demo content for every screen. Swap for the API client. |
| `shared/data/appearance.js` | Theme/accent/UI-style option sets — read by **both** Settings screens so they cannot drift. |
| `shared/data/seedDashboards.js` | Seeded dashboards, saved reports and AI activity, so no tab opens empty. |
| `ui/hybrid/lib/dashboards.js` | The widget contract: sources, `sanitize()`, `cleanWidgets()`, and a local stand-in for the server. |

Seed dashboards go through `cleanWidgets()` like anything else, so demo data cannot bypass the
validation real data has to pass.

---

## The widget contract

The single most important thing to understand before touching dashboards:

> **A widget stores the question, never the answer.**

```js
{ type: 'bar', title: 'Leave days by type',
  query: { source: 'leave', groupBy: 'leaveType', metric: 'sum', field: 'days' } }
```

Not a value. Because a stored number has already escaped whoever's permissions produced it — a
dashboard built by an HR admin and opened by an employee must return the employee's rows, which
is only possible if the query runs again, scoped to whoever is asking now.

`sanitize()` whitelists every part of a spec against the source registry. **The DSL is a menu,
not a parser** — there is no string a model can emit that becomes a query the registry does not
already know. It runs on model output *and* on client saves, because neither is trusted.

`npm run check` holds 27 assertions over this. The whitelist is a security boundary, so if it
stops rejecting, that must fail loudly rather than quietly widen what the model can reach. See
[docs/backend/15-dashboards.md](../backend/15-dashboards.md) for the server side.

---

## The backend is wired

`AppContext.send()` posts to `POST /api/v1/chat` and Hybrid's widgets resolve against
`POST /api/v1/query`. The full map of screen → endpoint, and the rules the offline fallback
follows, are in [API-INTEGRATION.md](API-INTEGRATION.md).

Two things to know before changing that code:

- **Only an unreachable server falls back to sample data.** A 403 is a real answer about your
  permissions, and substituting invented numbers for it would misrepresent someone's access.
- **Anything showing sample data says so** — a `sample` pill on the card, the bubble, or the page.
  A fallback indistinguishable from live data is worse than an error message.

What is still mock, deliberately: the **Overview** screen. Those figures are telemetry about
*using* NeuIQ (chats, streaks, messages), not Zoho People data, and the event pipeline behind
them does not exist yet. The file says so at the top.

## Known snags

- **A clean `npm install` fails.** `package.json` pins `vite@^8` while `@vitejs/plugin-react@^4`
  peers only to vite 7. The committed lockfile resolves fine and the build works; use
  `--legacy-peer-deps`. Real fix is `@vitejs/plugin-react@^5`.
- **Chart Builder uses native `<select>`.** The design system Hybrid borrows from forbids them —
  an OS-drawn option list ignores the theme, visible in mono and aqua. Marked with a `ponytail:`
  comment naming the upgrade (port their `SearchSelect`).
- **No chart library.** Bar, line, area, pie and donut are inline SVG in
  `ui/hybrid/components/Widget.jsx` — about 80 lines against recharts' ~500KB. Add one when a
  screen genuinely needs a sankey or a treemap.
- **`ui/hybrid/styles/global.css` is vendored** byte-for-byte from
  `PROJECT-BAJAJ/…/asset-management`. Do not edit it; NeuIQ-only rules go in `neuiq.css`, which
  loads after. That keeps it re-syncable when the source design system moves.
