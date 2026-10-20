/**
 * The Dzong brand mark: fortress walls that double as an envelope flap
 * (the V fold), with the arched gate below — the citadel and the mail in
 * one glyph — lit by the aurora glow rising from the base. Kept as an
 * inline component so it renders crisp at any size with no network
 * request. Gradient ids are intentionally static: every instance defines
 * the identical gradients, so id collisions resolve to an identical def.
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
      <defs>
        <radialGradient id="dzg-y" gradientUnits="userSpaceOnUse" cx="4" cy="66" r="20">
          <stop offset="0" stopColor="#FFC21A" stopOpacity=".95" />
          <stop offset=".45" stopColor="#FFC21A" stopOpacity=".4" />
          <stop offset="1" stopColor="#FFC21A" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dzg-r" gradientUnits="userSpaceOnUse" cx="18" cy="68" r="24">
          <stop offset="0" stopColor="#FF3B2F" stopOpacity=".95" />
          <stop offset=".45" stopColor="#FF3B2F" stopOpacity=".4" />
          <stop offset="1" stopColor="#FF3B2F" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dzg-v" gradientUnits="userSpaceOnUse" cx="32" cy="69" r="24">
          <stop offset="0" stopColor="#8A4DFF" stopOpacity=".95" />
          <stop offset=".45" stopColor="#8A4DFF" stopOpacity=".4" />
          <stop offset="1" stopColor="#8A4DFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dzg-b" gradientUnits="userSpaceOnUse" cx="46" cy="68" r="24">
          <stop offset="0" stopColor="#1F3BFF" stopOpacity=".95" />
          <stop offset=".45" stopColor="#1F3BFF" stopOpacity=".4" />
          <stop offset="1" stopColor="#1F3BFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dzg-c" gradientUnits="userSpaceOnUse" cx="60" cy="66" r="20">
          <stop offset="0" stopColor="#3FB4FF" stopOpacity=".95" />
          <stop offset=".45" stopColor="#3FB4FF" stopOpacity=".4" />
          <stop offset="1" stopColor="#3FB4FF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#1A1D20" />
      <rect width="64" height="64" rx="14" fill="url(#dzg-y)" />
      <rect width="64" height="64" rx="14" fill="url(#dzg-r)" />
      <rect width="64" height="64" rx="14" fill="url(#dzg-v)" />
      <rect width="64" height="64" rx="14" fill="url(#dzg-b)" />
      <rect width="64" height="64" rx="14" fill="url(#dzg-c)" />
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
