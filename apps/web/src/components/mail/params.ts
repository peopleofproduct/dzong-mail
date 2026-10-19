"use client";

import type { ReadonlyURLSearchParams } from "next/navigation";

/** Merge current search params with updates; undefined values are removed. */
export function buildParams(
  current: ReadonlyURLSearchParams | URLSearchParams,
  updates: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}
