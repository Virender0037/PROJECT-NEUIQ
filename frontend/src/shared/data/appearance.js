/**
 * The Appearance option sets, shared by every UI style.
 *
 * This module exists so the two Settings screens cannot drift. They render in different visual
 * languages — Classic paints inline via `<El>`, Hybrid uses its stylesheet's classes — but the
 * OPTIONS themselves are defined once, here. Adding a theme means editing `shared/lib/theme.js`
 * and it appears in both screens with no further work.
 *
 * Preview swatches are literal hexes rather than CSS variables on purpose: a theme card has to
 * show you what you are switching TO, which the live tokens cannot do — they are showing you
 * what you are already on.
 */
import { THEMES, ACCENTS } from '../lib/theme.js';

/**
 * A miniature of each theme for its picker card: page background, a surface panel on top of it,
 * and the accent. Enough to tell the seven apart at a glance without rendering the real thing.
 */
export const THEME_PREVIEW = {
  light: { bg: '#ffffff', panel: '#f0efec', ink: '#232320' },
  dim: { bg: '#1e2430', panel: '#313a4a', ink: '#eef2f8' },
  dark: { bg: '#262624', panel: '#3a3833', ink: '#f5f3ee' },
  mono: { bg: '#ffffff', panel: '#ededed', ink: '#141414' },
  monodark: { bg: '#141414', panel: '#2a2a2a', ink: '#ededed' },
  aqua: { bg: '#eef4fb', panel: '#ffffff', ink: '#16202e' },
  aquadark: { bg: '#101a28', panel: '#2c3e58', ink: '#eaf1fa' },
};

/** Theme cards, ready to render: id, label, and the three preview colours. */
export const THEME_CARDS = THEMES.map((t) => ({ ...t, ...THEME_PREVIEW[t.id] }));

export const ACCENT_SWATCHES = ACCENTS;

/**
 * The three layouts. This is the setting the palette menu also exposes, but Settings is where
 * people look for it, and a switch buried in a dropdown is a switch most users never find.
 */
export const UI_STYLES = [
  {
    id: 'classic',
    label: 'Classic',
    sub: 'Chat first. A quiet sidebar and a wide reading column.',
    icon: 'message',
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    sub: 'A data workspace — floating dock, analytics tabs and AI dashboards.',
    icon: 'layoutGrid',
  },
  {
    id: 'modern',
    label: 'Modern',
    sub: 'Not built yet.',
    icon: 'sparkles',
    disabled: true,
  },
];

/** The Settings sub-navigation, shared so both screens show the same sections in the same order. */
export const SETTINGS_SECTIONS = [
  ['appearance', 'Appearance', 'palette'],
  ['general', 'General', 'settings'],
  ['notifications', 'Notifications', 'bell'],
  ['account', 'Account', 'user'],
];
