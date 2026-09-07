/**
 * Logo — the NeuIQ cube logomark. A nested-cube wireframe with edges routed
 * to the center from the top and side nodes. Inherits color via currentColor.
 */
export default function Logo({ size = 27, stroke = 1.6, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinejoin="round"
      strokeLinecap="round"
      style={style}
    >
      <path d="M12 2 20.66 7 20.66 17 12 22 3.34 17 3.34 7 Z" />
      <path d="M12 6 17.2 9 17.2 15 12 18 6.8 15 6.8 9 Z" />
      <path d="M12 12 12 6" />
      <path d="M12 12 6.8 15" />
      <path d="M12 12 17.2 15" />
      <path d="M6.8 9 3.34 7" />
      <path d="M17.2 9 20.66 7" />
      <path d="M12 18 12 22" />
    </svg>
  );
}
