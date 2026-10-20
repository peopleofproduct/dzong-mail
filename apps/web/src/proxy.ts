import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CORS gate for the local HTTP API. The API is meant for local callers; a
 * companion browser extension is one of them, but its Origin header carries
 * a `*-extension://` scheme that regular web pages cannot forge — so echoing
 * that origin back is safe and keeps localhost APIs unreadable to websites.
 * Bearer-token auth (DZONG_API_TOKEN) still applies inside each route.
 */
const EXTENSION_ORIGIN = /^[a-z]+-extension:\/\/[a-z0-9-]+$/i;

const ALLOW_HEADERS = "Authorization, Content-Type";
const ALLOW_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Max-Age": "86400",
  };
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  if (!EXTENSION_ORIGIN.test(origin)) {
    return request.method === "OPTIONS"
      ? new NextResponse(null, { status: 204 })
      : NextResponse.next();
  }

  const headers = corsHeaders(origin);
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/v1/:path*",
};
