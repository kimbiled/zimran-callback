// Callback logo: six rounded audio bars (two voices, a gap between them) + the wordmark.
// Geometry traced from the brand file; vector so it stays crisp and themeable.

const BARS = [
  { x: 0, y: 0, w: 56, h: 211 },
  { x: 72, y: 41, w: 54, h: 143 },
  { x: 141, y: 81, w: 53, h: 90 },
  { x: 255, y: 81, w: 53, h: 90 },
  { x: 324, y: 41, w: 53, h: 143 },
  { x: 393, y: 0, w: 56, h: 211 },
];

/** The bars mark alone. `animated` makes the bars "talk" on hover of a parent `.group`. */
export function LogoMark({ height = 22, animated = true, className = "" }: { height?: number; animated?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 449 211"
      height={height}
      width={(height * 449) / 211}
      className={`${animated ? "logo-bars" : ""} ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cb-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff7a3d" />
          <stop offset="55%" stopColor="#ff2e6e" />
          <stop offset="100%" stopColor="#9b7bff" />
        </linearGradient>
      </defs>
      {BARS.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.w / 2} fill="url(#cb-logo-grad)" style={{ ["--i" as string]: i }} />
      ))}
    </svg>
  );
}

/** Mark + "Callback" wordmark. */
export function Logo({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark height={size} />
      <span className="display text-fg" style={{ fontSize: size * 1.12, fontWeight: 800, letterSpacing: "-0.045em" }}>
        Callback
      </span>
    </span>
  );
}
