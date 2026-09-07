# UI Styles and Theming

NeuIQ ships the same product in three layouts. This is how they differ, what they share, and how
to add a fourth.

Read [00-overview.md](00-overview.md) first.

---

## The separation

| | Owned by |
| --- | --- |
| State, actions, routing, data | `shared/` — one copy |
| **Theme** (palette, 7 options) | `shared/lib/theme.js` — one copy |
| **Accent** (5 options) | `shared/lib/theme.js` — one copy |
| Shell, screens, components, stylesheet | each `ui/<style>/` |

A theme is a palette. A UI style is a layout. Picking **Dim** means the same thing in every
style, and switching style keeps your theme — because both live in shared state, not in a style.

This was not the original design. Hybrid's theme state started local, because Classic only knew
light and dark and flattening seven into two would have cost five themes. Teaching Classic the
other five removed the reason, so it moved to `shared/`. Worth knowing if you find a stale
comment saying otherwise.

---

## The three styles

### Classic — `ui/classic/`

The original prototype. Chat-first: a quiet resizable sidebar and a wide reading column.

- **Styling idiom:** no CSS classes for components. Everything is inline via the `<El>`
  primitive, which takes raw CSS strings for base / hover / active / focus states.
- **Stylesheet:** `styles/theme.css` — about 255 lines, almost all tokens and keyframes.
- **Screens:** 13 — the original 11, plus **AI** and a real on-demand **dashboard**
  (`pages/CustomDashboard.jsx`), added so the two styles offer the same capabilities.
  Reports and Chart Builder both route to its dashboard screen; Hybrid splits them into tabs.

### Hybrid — `ui/hybrid/`

A data workspace. Floating dock inset from the window, a separate main pane, analytics tabs, AI
dashboards.

- **Styling idiom:** a real class system — `.card`, `.btn`, `.dw-grid`, `.dock-*`, `.an-*`.
- **Stylesheet:** `styles/global.css` (5,277 lines, **vendored — do not edit**) +
  `styles/neuiq.css` (NeuIQ-only additions, loads after).
- **Screens:** the same 11, plus Analytics (Reports / Chart Builder / AI Dashboards as three
  tabs) and AI.

`global.css` is copied byte-for-byte from `PROJECT-BAJAJ/…/asset-management` so it can be
re-synced when that design system moves. Only ~1.3% of it was ever domain-specific, which is why
copying beat extracting a "clean subset".

### Modern — `ui/modern/`

A stub. Renders `UiPlaceholder` so switching to it explains itself instead of showing a blank
screen.

---

## Why they cannot share a page

Classic paints inline and defines almost no selectors. Hybrid's stylesheet styles bare `html`,
`body` and `table`. Load both and Hybrid wins everywhere, whichever style is mounted.

`App.jsx` lazy-loads each style so its stylesheet arrives in its own chunk. **This is a
correctness requirement, not an optimisation.** If you ever convert those back to static imports,
Classic will silently inherit Hybrid's typography and table rules.

---

## The theme system

### Two axes, seven themes

```
data-theme    light | dark | mono | aqua     which component rules apply
data-variant  dim | mono | aqua              re-tints the base tokens on top
```

| Theme | Attributes | Character |
| ----- | ---------- | --------- |
| Light | `light` | Default |
| Dim | `dark` + `dim` | Softer, cooler dark — easier for long sessions |
| Dark | `dark` | True dark |
| Mono | `mono` | One hue, maximum contrast |
| Mono dark | `dark` + `mono` | Greyscale on near-black |
| Aqua | `aqua` | Cool glass — the one theme that turns backdrop blur on |
| Aqua dark | `dark` + `aqua` | Glass on deep blue |

The variant trick is the whole reason this is maintainable: **dim, mono-dark and aqua-dark reuse
every dark component rule** and only override base tokens. Ten lines each instead of a second
copy of the dark palette that drifts the first time one is edited.

### Accents

Five, identical in both styles: Default, Blue, Red, Green, Ochre. `''` (Default) sets no
attribute, so each style's own base accent shows through — Classic's warm terracotta, Hybrid's
blue.

Two rules encoded in the stylesheets:

- **Dark forms are lifted.** The same hex that reads as "red" on white is muddy on near-black and
  fails contrast against it, so `[data-theme="dark"][data-accent="red"]` is a brighter red.
- **Mono ignores accents entirely.** One hue is the whole point of mono, so both mono forms
  override every accent back to the ink colour rather than honouring the choice. The Settings
  screens say so in a caption, because a picker that appears to do nothing reads as a bug.

### Applying it

```js
useEffect(() => applyTheme(theme, accent), [theme, accent]);
```

One effect per style, and that is the only code that touches these attributes. `applyTheme`
returns its own cleanup, which removes all three — necessary because the outgoing style's
stylesheet unloads and its attributes would otherwise style the incoming one with tokens it never
defined.

---

## Switching styles

Three ways, all writing the same shared state:

1. **Settings → Appearance → Interface.** The discoverable one.
2. **The palette menu** in Hybrid's top bar.
3. **`?ui=hybrid`** in the URL — linkable, no code change, useful for demos and bug reports.

Precedence on load: `?ui=` → last choice in `localStorage` → `CONFIG.uiStyle`.

---

## Settings parity

Both Settings screens read their options from **`shared/data/appearance.js`**:

```js
THEME_CARDS       // 7 themes + preview colours
ACCENT_SWATCHES   // 5 accents
UI_STYLES         // 3 layouts
SETTINGS_SECTIONS // the sub-nav
```

The same is true of dashboards. Both styles call `useDashboards()` from
`shared/dashboards/`, render `<Widget>` over the shared chart primitives in
`shared/components/charts.jsx`, and write to the same `/dashboards` endpoints — so a dashboard
built in Classic opens in Hybrid. Each style owns only its card chrome and its **palette**, which
is passed to the charts as a prop rather than read from CSS: the two define different colour
variables (`--ok`/`--warn` against `--green`/`--amber`), and an unset CSS variable in an SVG
`fill` renders nothing and reports nothing.

They look nothing alike — Classic paints inline, Hybrid uses classes — but they can never offer
different choices, because the choices are defined once. Add a theme to `theme.js` and both
screens grow a card with no further work.

Theme cards show a **miniature of the theme** (page, a panel on it, a text bar) rather than a flat
swatch. A single colour cannot tell Dim from Dark; a page-with-a-panel can.

---

## Adding a fourth style

1. `mkdir ui/<name>/{components,pages,styles}`.
2. Write `index.jsx`: read `useApp()`, call `applyTheme(theme, accent)` in one effect, draw a
   shell, render a screen per `view`.
3. Import your stylesheet **from that entry**, never from `main.jsx`, so it loads only when the
   style is active.
4. Define all seven theme token blocks and the five accents. If you skip a theme, the picker will
   still offer it and it will render wrong — the option set is shared.
5. Add it to `UI_STYLES` in `shared/data/appearance.js` and to `UI_STYLES` in `App.jsx`.
6. Use the shared motion scale (`--ease`, `--t-fast/base/slow`) and honour
   `prefers-reduced-motion`.

Nothing outside `ui/<name>/` and those two registries should need to change. If it does, that is
the signal something belongs in `shared/`.
