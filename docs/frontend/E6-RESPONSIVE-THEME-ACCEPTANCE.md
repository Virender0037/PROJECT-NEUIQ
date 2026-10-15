# E6 — Mandatory responsive layout and Light/Dark theme acceptance criteria

Status: **requirement recorded 2026-10-14; NOT implemented.** These are mandatory acceptance
criteria for E6 (frontend integration) in **both Classic and Hybrid**. E6 is not complete until
every item below passes in a real browser. Nothing here may be reported as working on mobile or in
a theme without that test.

The gap list comes from a **static, read-only code review** (2026-10-14) — no browser was used, so
every behaviour claim below is a finding from the code, and several are marked as needing browser
confirmation.

## 1. Requirements

**Responsive** — mobile (320, 375, 430 px), tablet (768), laptop (1024), desktop (1440):
- chatbot fully usable on mobile, including the on-screen keyboard;
- responsive navigation with a mobile menu;
- no unintended horizontal scrolling;
- dashboards, tables, forms, buttons, dialogs and charts adapt to small screens;
- touch interactions; inputs that do not trigger mobile zoom;
- loading, empty, error and authenticated states all responsive.

**Light / Dark theme:**
- a visible Light/Dark switch in the authenticated shell;
- follows the operating-system preference until the user chooses;
- the manual choice persists and is restored;
- every component themed through tokens, not hard-coded colours;
- readable contrast in charts, tables, messages, navigation and forms;
- no theme flash at startup.

## 2. Current gaps (static review — Classic / Hybrid)

**Blockers**

1. **Hybrid has no navigation at ≤1024 px.** The vendored design system hides the dock and expects a
   hamburger drawer (`.nav-burger`, `.mobile-nav` CSS exists in `global.css`), but NeuIQ's
   `ui/hybrid/components/TopBar.jsx` renders neither.
2. **Classic has no responsive layout.** No width media queries; the sidebar is always rendered at
   248 px (72 px collapsed); no hamburger or drawer; inline `<El>` styles cannot express breakpoints.
3. **No OS-preference default and no pre-paint theme.** No `prefers-color-scheme`/`matchMedia` use
   anywhere; `index.html` has no inline theme script; `data-theme` is applied in a `useEffect` after
   first paint — a dark user very likely sees a light→dark flash (needs browser confirmation).
4. **No one-click Light/Dark switch** in either authenticated shell (themes are chosen from 7 cards or
   a 7-item menu).

**Major**

5. Classic dashboard grids are a fixed `repeat(3,1fr)` (`ui/classic/pages/CustomDashboard.jsx`).
6. Hybrid `.dw-grid` `minmax(320px,1fr)` overflows at 320/375 px.
7. Chat on mobile: composer not pinned in Hybrid; auto-scroll targets a non-scrolling element
   (`.neuiq-chat`); Classic uses `100vh`, not `dvh`; composer toolbar does not wrap.
8. Every input/textarea/select is below 16 px (iOS zoom) in both UIs.
9. Contrast: Classic `--text-subtle` (~3.3:1 light, ~3.7:1 dark) and Hybrid `--ink-dim` (~2.7:1) fail
   WCAG AA for small text; mono themes give two chart series the same colour.
10. Classic Settings / EmptyState / Landing use fixed multi-column layouts.
11. Classic touch: sidebar resize is mouse-only; `<El>` hover sticks after a tap.
12. Hybrid build modal lacks `role="dialog"`, `aria-modal`, focus trap and Escape.
13. Classic chat tables are clipped (`overflow: hidden`) instead of scrolling.
14. No `color-scheme`, so native controls stay light in dark themes.

**Minor** — private chat overwrites the saved theme (`AppContext.jsx` incognito path); Hybrid uses an
undefined `--line` token in `TopBar.jsx`; a few literal `#fff`; 30–34 px touch targets; Classic has no
`:focus-visible` styles and icon buttons without `aria-label`; fixed 26 px paddings; no
`<meta name="theme-color">`; fixed chart sizes in `shared/components/charts.jsx`.

**Already present (preserve):** viewport meta; theme persistence (`neuiq_theme`, `neuiq_accent`,
validated reads); token-driven chart palettes; Hybrid's vendored breakpoint ladder (1024/900/720/600),
`dvh` shell and pointer-coarse sizing; Hybrid dock keyboard and pointer resize; reduced-motion rules.

## 3. Acceptance tests (E6)

**Tooling:** the repo has **no** browser test runner today. E6 adds `@playwright/test` (Chromium,
WebKit, Firefox), `@axe-core/playwright`, and a `test:e2e` script run against `vite preview` of the
production build with the backend in seed/demo mode. Real-device checks are needed for the iOS keyboard.

**Matrix:** 6 widths (320, 375, 430, 768, 1024, 1440) × 2 UIs (`?ui=classic`, `?ui=hybrid`) × 2 themes
(light, dark) = **24 configurations**, plus spot checks of dim, mono and aqua.

- [ ] No horizontal page scroll (`scrollWidth <= innerWidth`) on: sign-in, chat empty and populated
      (including a table answer), dashboard, custom dashboards (built and loading), chart builder,
      AI capabilities, settings, API-unavailable and 403 states.
- [ ] At ≤1024 a menu button opens a drawer reaching every destination; it closes on selection, scrim
      and Escape; focus moves in and returns. At 1440 the full navigation shows and no menu button.
- [ ] Dashboards: 1 column at ≤430, 2+ at ≥1024, no clipped legends or values; tables scroll inside
      their container; modals fit at 320 with the close button visible.
- [ ] Chat at 320/375/430: composer visible on load and after 10 messages; the latest reply scrolls
      into view; no zoom on focus (computed font-size ≥16 px); keyboard does not cover input (real
      device); send, retry and pin work by touch.
- [ ] Theme: empty storage + OS dark → first paint already dark (no light frame); OS light → light;
      follows OS changes until a manual choice; manual choice persists across reload and UI switch
      and overrides the OS; private chat does not change the saved theme; native controls match.
- [ ] A visible Light/Dark control in both shells: keyboard-operable, named, exposes its state.
- [ ] Zero axe `color-contrast` violations in all 24 configurations (text ≥4.5:1, large/UI ≥3:1,
      including chart labels, tables, nav, chat, placeholders and error states); chart series
      distinguishable in every theme; zero axe critical/serious violations.
- [ ] Keyboard only: logical tab order, visible focus, no traps, Escape closes menus/modals and
      returns focus, drawer and theme switch operable with Enter/Space.
- [ ] `prefers-reduced-motion: reduce` disables drawer, view, toast and theme transitions.
- [ ] `npm run build` succeeds; E2E runs against the production build; `npm run check` stays green;
      CLS < 0.1 from theme application.

## 4. Scope rule

E2.2 (backend) only reviewed and recorded this. No frontend code was changed. Implementation belongs
to E6, must not be an unrelated redesign, and must keep the vendored Hybrid `global.css` untouched
(overrides go in `neuiq.css`).
