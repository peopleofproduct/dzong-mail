import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { dataDir } from "@dzong/sync-engine";
import { getSetting } from "@/lib/settings";

/** Retry a previously-missed lookup after this long. */
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4_000;

/** Freemail domains whose favicon would be the provider's logo, not the sender's. */
const FREEMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "zoho.com",
  "mail.com",
  "fastmail.com",
  "yandex.com",
]);

interface CachedAvatar {
  body: Uint8Array;
  contentType: string;
}

async function fetchImage(url: string): Promise<CachedAvatar | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const body = new Uint8Array(await res.arrayBuffer());
    if (body.length < 32) return null; // empty/placeholder payloads
    return { body, contentType };
  } catch {
    return null;
  }
}

/**
 * Resolve a sender avatar: Gravatar for people, then the sender domain's
 * favicon for companies (skipped for freemail domains where it would just
 * be the provider's logo). Results are cached on local disk — each address
 * is looked up at most once, so a list render never fans out remote calls.
 *
 * Privacy: enabled by default for a complete-looking list — each sender is
 * looked up at most once and cached on disk. Settings → Workspace →
 * "Look up sender avatars online" turns it off entirely: nothing is
 * served, not even cached hits, and initials render in place. Users who
 * don't want Gravatar or sender domains learning who mails them should
 * flip it off.
 */
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  // The hard gate: when disabled, no remote avatar data is served at all —
  // initials render in place (SenderAvatar falls back on 404).
  const enabled = await getSetting<boolean>("avatarsEnabled", true);
  if (!enabled) return NextResponse.json({ error: "avatars disabled" }, { status: 404 });

  const key = createHash("sha256").update(email).digest("hex");
  const dir = path.join(dataDir(), "avatars");
  const imgPath = path.join(dir, `${key}.img`);
  const metaPath = path.join(dir, `${key}.json`);
  const missPath = path.join(dir, `${key}.miss`);

  // Cache hit — bytes + stored content type.
  try {
    const [body, meta] = await Promise.all([readFile(imgPath), readFile(metaPath, "utf8")]);
    const { contentType } = JSON.parse(meta) as { contentType?: string };
    return new NextResponse(Buffer.from(body), {
      headers: {
        "Content-Type": contentType ?? "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    /* no cache — resolve below */
  }

  // Negative cache — don't hammer sources for senders with no avatar.
  try {
    const m = await stat(missPath);
    if (Date.now() - m.mtimeMs < MISS_TTL_MS) {
      return NextResponse.json({ error: "no avatar" }, { status: 404 });
    }
  } catch {
    /* no miss marker */
  }

  const md5 = createHash("md5").update(email).digest("hex");
  const domain = email.split("@")[1];
  // Only query real public hostnames — never IPs or local names.
  const publicDomain = /^(?=.*\.)[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
  const sources = [`https://www.gravatar.com/avatar/${md5}?d=404&s=128`];
  if (publicDomain && !FREEMAIL_DOMAINS.has(domain)) {
    sources.push(`https://${domain}/favicon.ico`, `https://www.${domain}/favicon.ico`);
  }

  for (const url of sources) {
    const hit = await fetchImage(url);
    if (hit) {
      await mkdir(dir, { recursive: true });
      await Promise.all([
        writeFile(imgPath, hit.body),
        writeFile(metaPath, JSON.stringify({ contentType: hit.contentType })),
      ]);
      return new NextResponse(Buffer.from(hit.body), {
        headers: {
          "Content-Type": hit.contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
  }

  await mkdir(dir, { recursive: true });
  await writeFile(missPath, String(Date.now()));
  return NextResponse.json({ error: "no avatar" }, { status: 404 });
}
