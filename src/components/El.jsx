import { useState } from 'react';
import { css } from '../lib/style.js';

/**
 * El — the single styling primitive for the whole app.
 *
 * It renders any element (`as`) and accepts the design's raw CSS strings:
 *   css     -> base styles                (always applied)
 *   hover   -> merged while pointer is over
 *   active  -> merged while pressed
 *   focus   -> merged while focused
 *   style   -> dynamic React style object (merged last, wins)
 *
 * This mirrors the original design's style / style-hover / style-active /
 * style-focus attributes 1:1, so markup ports over faithfully while the
 * interactive states stay in JS (no global stylesheet churn).
 */
export default function El({
  as: Tag = 'div',
  css: base = '',
  hover = '',
  active = '',
  focus = '',
  style,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  onFocus,
  onBlur,
  children,
  ...rest
}) {
  const [h, setH] = useState(false);
  const [a, setA] = useState(false);
  const [f, setF] = useState(false);

  const merged = {
    ...css(base),
    ...(h && hover ? css(hover) : {}),
    ...(a && active ? css(active) : {}),
    ...(f && focus ? css(focus) : {}),
    ...style,
  };

  return (
    <Tag
      style={merged}
      onMouseEnter={(e) => { if (hover) setH(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setH(false); setA(false); onMouseLeave?.(e); }}
      onMouseDown={(e) => { if (active) setA(true); onMouseDown?.(e); }}
      onMouseUp={(e) => { setA(false); onMouseUp?.(e); }}
      onFocus={(e) => { if (focus) setF(true); onFocus?.(e); }}
      onBlur={(e) => { setF(false); onBlur?.(e); }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
