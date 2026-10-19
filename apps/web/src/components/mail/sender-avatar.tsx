"use client";

import { useState } from "react";

interface SenderAvatarProps {
  email: string;
  name?: string | null;
  size?: number;
}

/** Sender avatar: locally cached Gravatar/domain logo over deterministic
 *  initials — initials stay visible while the image loads and on any miss. */
export function SenderAvatar({ email, name, size = 32 }: SenderAvatarProps) {
  const [failed, setFailed] = useState(false);

  const label = (name ?? email).trim();
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  let hash = 0;
  for (const ch of email) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium text-white select-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        backgroundColor: `hsl(${hue} 55% 45%)`,
      }}
      aria-hidden
    >
      {initials}
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/avatar?email=${encodeURIComponent(email)}`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}
