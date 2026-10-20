/**
 * The Dzong brand mark: fortress walls that double as an envelope flap
 * (the V fold), with the arched gate below — the citadel and the mail in
 * one glyph. Kept as an inline component so it renders crisp at any size
 * with no network request.
 */
export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden
      role="img"
    >
      <rect width="64" height="64" rx="14" fill="#1A1D20" />
      <g
        stroke="#E9ECEF"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M7 18H57" />
        <path d="M12 18L9 50H55L52 18" />
        <path d="M12 18L32 34L52 18" />
        <path d="M26 50V40a6 6 0 0 1 12 0V50" />
      </g>
    </svg>
  );
}
