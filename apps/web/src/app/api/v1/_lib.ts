import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Local-first auth: the API is open by default since it only listens on the
 * user's own machine. Set UNWALLED_API_TOKEN to require a Bearer token —
 * recommended if the dev server is ever bound to a non-loopback interface.
 */
export function apiGuard(request: NextRequest): NextResponse | null {
  const token = process.env.UNWALLED_API_TOKEN;
  if (!token) return null;
  const presented = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  const match =
    presented.length === expected.length &&
    timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
  if (match) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
