/**
 * The theme registry — one source of truth for every UI style.
 *
 * A **theme** is the palette and mood. A **UI style** (Classic / Hybrid / Modern) is the layout
 * and component language. They are independent on purpose: picking "Dim" should mean the same
 * thing whichever style you are in, and switching style should not throw your appearance away.
 *
 * Seven themes ride on two attributes rather than seven separate stylesheets:
 *
 *   data-theme    picks which component rules apply  (light | dark | mono | aqua)
 *   data-variant  re-tints the base tokens on top    (dim | mono | aqua)
 *
 * So "dim" is `data-theme=dark data-variant=dim` — it reuses every dark component rule and only
 * shifts the base colours. Without that trick, mono-dark and aqua-dark would each need a full
 * copy of the dark stylesheet, and the three would drift apart the first time one was edited.
 *
 * Both attributes go on `document.documentElement`, not on a wrapper div, so `body` and the
 * scrollbars are themed too.
 */

/** Theme id -> [data-theme, data-variant]. A null variant means the attribute is removed. */
export const THEME_ATTRS = {
  light: ['light', null],
  dim: ['dark', 'dim'],
  dark: ['dark', null],
  mono: ['mono', null],
  monodark: ['dark', 'mono'],
  aqua: ['aqua', null],
  aquadark: ['dark', 'aqua'],
};

/** Ordered for display: the two light-ish ones, the darks, then the two speciality pairs. */
export const THEMES = [
  { id: 'light', label: 'Light', group: 'Light' },
  { id: 'dim', label: 'Dim', group: 'Dark' },
  { id: 'dark', label: 'Dark', group: 'Dark' },
  { id: 'mono', label: 'Mono', group: 'Mono' },
  { id: 'monodark', label: 'Mono dark', group: 'Mono' },
  { id: 'aqua', label: 'Aqua', group: 'Aqua' },
  { id: 'aquadark', label: 'Aqua dark', group: 'Aqua' },
];

/**
 * Accents. `''` is the default and sets no attribute, so each UI style's own base accent shows
 * through — Classic's warm terracotta, Hybrid's blue. The other four are identical in both,
 * because an accent is a pure colour choice with no layout opinion in it.
 *
 * `swatch` is only for drawing the picker; the real values live in each style's stylesheet so a
 * theme can lift or mute them (a dark theme needs a brighter accent to hold the same contrast).
 */
export const ACCENTS = [
  { id: '', label: 'Default', swatch: '#c15f3c' },
  { id: 'blue', label: 'Blue', swatch: '#0071e3' },
  { id: 'red', label: 'Red', swatch: '#e0322e' },
  { id: 'green', label: 'Green', swatch: '#1f9d57' },
  { id: 'ochre', label: 'Ochre', swatch: '#c8871a' },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const ACCENT_IDS = ACCENTS.map((a) => a.id);

/** Which glyph represents a theme in a picker. */
export const themeIcon = (id) =>
  (id === 'light' ? 'sun' : id === 'mono' || id === 'monodark' ? 'contrast' : 'moon');

/**
 * Write the theme onto the document, and return a function that takes it back off again.
 *
 * Every UI style calls this from one effect, so there is exactly one place that touches these
 * attributes. The cleanup matters: when you switch style, that style's stylesheet unloads, and
 * leaving its attributes behind would style the next one with tokens it never defined.
 */
export function applyTheme(theme, accent) {
  const root = document.documentElement;
  const [dt, dv] = THEME_ATTRS[theme] || THEME_ATTRS.light;

  root.setAttribute('data-theme', dt);
  if (dv) root.setAttribute('data-variant', dv);
  else root.removeAttribute('data-variant');
  if (accent) root.setAttribute('data-accent', accent);
  else root.removeAttribute('data-accent');

  return () => {
    root.removeAttribute('data-theme');
    root.removeAttribute('data-variant');
    root.removeAttribute('data-accent');
  };
}

/** True for the themes that render dark, including the variants that ride on data-theme=dark. */
export const isDarkTheme = (id) => (THEME_ATTRS[id] || [])[0] === 'dark';
