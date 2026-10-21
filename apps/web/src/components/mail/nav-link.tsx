"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

/** Renders inside a Link and reads its pending state — shows a tiny pulse
 *  so a click acknowledges immediately while the server render streams in. */
function PendingDot() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400 align-middle"
      aria-hidden
    />
  );
}

/**
 * Link with instant click feedback: active-press styling on mousedown plus a
 * pending indicator while the navigation is in flight. Keeps the target's
 * own styling API (className/children/title) — use exactly like <Link>.
 */
export function NavLink({
  href,
  className = "",
  children,
  title,
  prefetch,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  title?: string;
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      title={title}
      prefetch={prefetch}
      className={`${className} transition-all duration-100 active:scale-[0.97] active:brightness-95`}
    >
      {children}
      <PendingDot />
    </Link>
  );
}
