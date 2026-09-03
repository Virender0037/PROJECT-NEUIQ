/**
 * Convert a plain CSS declaration string (as authored in the original design,
 * e.g. "display:flex;gap:10px;background:var(--surface)") into a React style
 * object. This lets components carry the exact declarations from the source
 * design with zero visual drift.
 *
 * - kebab-case properties become camelCase (border-radius -> borderRadius)
 * - vendor prefixes are handled (-webkit-backdrop-filter -> WebkitBackdropFilter)
 * - CSS custom properties are preserved verbatim (--accent stays --accent)
 * - only the first ":" is treated as the property/value separator, so values
 *   like color-mix(in srgb, ...) or calc(100% + 10px) survive intact.
 */
export function css(str) {
  const out = {};
  if (!str) return out;
  for (const decl of String(str).split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop) continue;
    if (prop.startsWith('--')) {
      out[prop] = val; // CSS variable — keep as-is
    } else {
      const key = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = val;
    }
  }
  return out;
}

/** Merge several CSS strings / style objects into a single React style object. */
export function mergeCss(...parts) {
  return parts.reduce((acc, p) => {
    if (!p) return acc;
    return Object.assign(acc, typeof p === 'string' ? css(p) : p);
  }, {});
}
