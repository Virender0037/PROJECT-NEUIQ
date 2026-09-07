# Theming guide — Classic UI

> **Scope:** this document describes the **Classic UI** (`frontend/src/ui/classic/`), the original prototype. The Modern and Hybrid styles will get their own documents once their prototypes land.

All visual styling is driven by **semantic CSS custom properties**. Components never
hard-code a color — they reference a variable like `var(--surface)` or `var(--accent)`.
A theme is just a different set of values for those variables.

## How a theme is applied

`App` sets `data-theme` on the root element:

```jsx
<div data-theme={theme}> … </div>
```

`frontend/src/ui/classic/styles/theme.css` defines the variables for `:root` (light) and overrides them
under `[data-theme="dark"]`. Because every component reads the variables at render time,
flipping `data-theme` re-colors the entire app in one paint — no re-mount, no prop churn.

## Token groups

| Group        | Variables                                                                 |
| ------------ | ------------------------------------------------------------------------- |
| Surfaces     | `--app-bg`, `--surface`, `--surface-2`, `--sidebar-bg`, `--elevated`      |
| Text         | `--text`, `--text-muted`, `--text-subtle`                                 |
| Lines        | `--border`, `--border-strong`, `--border-w`                               |
| Accent       | `--accent`, `--accent-fg`, `--accent-soft`                                |
| Interaction  | `--hover`, `--active`, `--ring` (focus), `--shade`                         |
| Chips/chrome | `--chip`, `--chip-fg`, `--user-bubble`, `--code-bg`                        |
| Status       | `--green`, `--amber`, `--red`                                             |
| Elevation    | `--sh-xs` … `--sh-xl` (five cool-tinted shadow steps)                     |

## Radii & motion (conventions used across the UI)

- Buttons / inputs: 8–11px · cards: 12–14px · composer: 20px · pills/avatars: 999px
- Transitions: 120ms (micro), 180ms (toggles), 300ms+ (sidebar), all ease-out
- Press feedback: `translateY(.5px)` on active

## Adding a new theme

1. Add a block to `theme.css`:

   ```css
   [data-theme="midnight"] {
     --app-bg: #0a0a0f;
     --surface: #12121a;
     /* …override the full semantic set… */
   }
   ```

2. Add it to the theme cycle order in `AppContext.cycleTheme()` and to `THEME_CARDS`
   in `frontend/src/shared/data/mockData.js` so it appears in Settings → Appearance.

That's the whole change — no component edits.

## Overriding the accent

Set `CONFIG.accent` in `AppContext.jsx` to any hex (e.g. `'#4f55f2'`). `App` injects it
as an inline `--accent` on the root, which wins over the theme's default.
