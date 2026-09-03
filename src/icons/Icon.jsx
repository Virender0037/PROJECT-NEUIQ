import { ICONS } from './iconPaths.js';

/**
 * Icon — renders any glyph from the ICONS map at a given size.
 * Matches the source design: 24x24 viewBox, 1.6 stroke, round joins/caps.
 *
 * Props:
 *   name    key in ICONS
 *   size    px (default 18)
 *   filled  fill the shape with currentColor (used for the pinned star)
 *   stroke  override stroke width
 */
export default function Icon({ name, size = 18, filled = false, stroke = 1.6, style, ...rest }) {
  const parts = ICONS[name];
  if (!parts) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block', ...style }}
      {...rest}
    >
      {parts.map(([Tag, attrs], i) => <Tag key={i} {...attrs} />)}
    </svg>
  );
}
