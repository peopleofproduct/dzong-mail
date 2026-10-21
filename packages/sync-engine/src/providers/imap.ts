import { ImapFlow } from "imapflow";
import type { FetchMessageObject, ImapFlowOptions } from "imapflow";
import { simpleParser } from "mailparser";
import type { EmailAccount } from "@dzong/database";
import type { MailSyncProvider, ProviderSyncResult, RawMessage, SyncContext } from "../types";

// syncToken format: JSON map { "<mailbox path>": "<uidValidity>:<lastUid>" }.
// A mismatch in uidValidity forces a resync of that mailbox (RFC 3501).
// Legacy single-folder tokens ("v:uid") are treated as the INBOX entry.
const INITIAL_SYNC_LIMIT = 200;
const MAX_MESSAGES_PER_FOLDER = 500;
const MAX_FOLDERS = 40;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
// On incremental syncs, also refresh flags/envelopes for this many of the
// most recent already-synced UIDs — remote read/star/move changes made in
// another client would otherwise never reach the local store.
const FLAG_REFRESH_WINDOW = 200;

function parseFolderTokens(token: string | null): Record<string, string> {
  if (!token) return {};
  try {
    if (token.trim().startsWith("{")) {
      const parsed = JSON.parse(token) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => typeof v === "string") as [string, string][],
      );
    }
  } catch {
    /* malformed token — start fresh */
  }
  // Legacy: the whole token was the INBOX cursor.
  return { INBOX: token };
}

function parseSyncToken(token: string | undefined): { uidValidity?: number; lastUid: number } {
  if (!token) return { lastUid: 0 };
  const [validity, uid] = token.split(":");
  return { uidValidity: Number(validity) || undefined, lastUid: Number(uid) || 0 };
}

function addressList(value: { address?: string; name?: string }[] | undefined): string[] {
  return (value ?? []).map((v) => v.address).filter((a): a is string => Boolean(a));
}

/** Friendly display name for a mailbox: SPECIAL-USE flag first, then the
 *  last path segment ("[Gmail]/All Mail" → "All Mail", "Archive.2024" →
 *  "Archive.2024" when the delimiter is "."). */
function folderDisplayName(
  specialUse: string | undefined,
  path: string,
  delimiter: string,
): string {
  const special: Record<string, string> = {
    "\\Sent": "Sent",
    "\\Drafts": "Drafts",
    "\\Trash": "Trash",
    "\\Junk": "Spam",
    "\\Archive": "Archive",
    "\\All": "All Mail",
    "\\Flagged": "Starred",
    "\\Important": "Important",
  };
  if (specialUse && special[specialUse]) return special[specialUse];
  const segments = path.split(delimiter).filter(Boolean);
  return segments[segments.length - 1] || path;
}

/**
 * Shared ImapFlow connection options — used by both the sync provider and
 * the IDLE watcher so TLS policy is enforced consistently:
 *   SSL_TLS  → implicit TLS (default port 993)
 *   STARTTLS → plaintext connect + mandatory STARTTLS upgrade (default 143)
 *   NONE     → plaintext; the connect form warns this sends credentials
 *              unencrypted and it should only be used on localhost bridges.
 * `allowSelfSignedCerts` relaxes verification for self-hosted servers.
 */
export function imapClientOptions(account: EmailAccount, password: string): ImapFlowOptions {
  if (!account.imapHost || !account.username) {
    throw new Error("IMAP host and username are required");
  }
  const security = account.imapSecurity ?? "SSL_TLS";
  return {
    host: account.imapHost,
    port: account.imapPort ?? (security === "SSL_TLS" ? 993 : 143),
    secure: security === "SSL_TLS",
    // ImapFlow fails the connection when STARTTLS is requested but the
    // server does not advertise it — no silent plaintext downgrade.
    doSTARTTLS: security === "STARTTLS",
    auth: { user: account.username, pass: password },
    tls: { rejectUnauthorized: !account.allowSelfSignedCerts },
    logger: false,
  };
}

interface ParsedSource {
  msg: FetchMessageObject;
  parsed: Awaited<ReturnType<typeof simpleParser>>;
}

function toRawMessage(
  { msg, parsed }: ParsedSource,
  providerMessageId: string,
  folder: string,
): RawMessage {
  const flags = msg.flags ?? new Set<string>();
  const references = parsed.references
    ? Array.isArray(parsed.references)
      ? parsed.references[0]
      : parsed.references
    : undefined;

  // Keep the headers needed for reply threading and the details popover
  // (mailed-by / signed-by / TLS). Received is multi-value; the first
  // entry is the final delivery hop.
  const hdr = (name: string) => {
    const v = parsed.headers.get(name);
    return Array.isArray(v) ? String(v[0]) : v ? String(v) : undefined;
  };
  const headers: Record<string, string> = {};
  for (const name of [
    "Message-ID",
    "Return-Path",
    "Authentication-Results",
    "DKIM-Signature",
    "Received",
    "In-Reply-To",
    "References",
  ]) {
    const v = hdr(name.toLowerCase());
    if (v) headers[name] = v;
  }

  return {
    providerMessageId,
    threadId: references ?? parsed.inReplyTo ?? parsed.messageId ?? undefined,
    folder,
    subject: parsed.subject ?? undefined,
    snippet: parsed.text?.replace(/\s+/g, " ").trim().slice(0, 200),
    fromAddress: parsed.from?.value[0]?.address ?? "unknown",
    fromName: parsed.from?.value[0]?.name || undefined,
    toAddresses: addressList(
      Array.isArray(parsed.to) ? parsed.to.flatMap((g) => g.value) : parsed.to?.value,
    ),
    ccAddresses: addressList(
      Array.isArray(parsed.cc) ? parsed.cc.flatMap((g) => g.value) : parsed.cc?.value,
    ),
    bccAddresses: [],
    bodyText: parsed.text ?? undefined,
    bodyHtml: parsed.html || undefined,
    attachments: (parsed.attachments ?? []).map((a) => ({
      // mailparser marks every non-text part an attachment, so inline
      // text/calendar invites arrive here too. Cap stored blobs at 15 MB
      // to match the Gmail/Graph providers.
      filename: a.filename ?? (a.contentType === "text/calendar" ? "invite.ics" : "attachment"),
      mimeType: a.contentType,
      sizeBytes: a.size,
      contentId: a.cid,
      content: a.size && a.size > MAX_ATTACHMENT_BYTES ? undefined : a.content,
    })),
    sizeBytes: msg.size ?? msg.source?.length,
    receivedAt: parsed.date ?? (msg.internalDate ? new Date(msg.internalDate) : new Date()),
    isRead: flags.has("\\Seen"),
    isStarred: flags.has("\\Flagged"),
    isDraft: flags.has("\\Draft"),
    providerLabels: [...flags].filter((f) => !f.startsWith("\\")),
    headers,
  };
}

/** Envelope+flags refresh row: no body download, but real subject/sender/
 *  date so a row that turns out to be missing locally still inserts validly. */
function envelopeToRawMessage(
  msg: FetchMessageObject,
  providerMessageId: string,
  folder: string,
): RawMessage {
  const flags = msg.flags ?? new Set<string>();
  const env = msg.envelope;
  const addresses = (list?: { address?: string; name?: string }[]) =>
    (list ?? []).map((a) => a.address).filter((a): a is string => Boolean(a));
  const headers: Record<string, string> = {};
  if (env?.messageId) headers["Message-ID"] = env.messageId;
  if (env?.inReplyTo) headers["In-Reply-To"] = env.inReplyTo;
  return {
    providerMessageId,
    threadId: env?.inReplyTo ?? env?.messageId,
    folder,
    subject: env?.subject,
    fromAddress: env?.from?.[0]?.address ?? "unknown",
    fromName: env?.from?.[0]?.name || undefined,
    toAddresses: addresses(env?.to),
    ccAddresses: addresses(env?.cc),
    bccAddresses: [],
    headers,
    receivedAt: env?.date ?? (msg.internalDate ? new Date(msg.internalDate) : new Date()),
    isRead: flags.has("\\Seen"),
    isStarred: flags.has("\\Flagged"),
    isDraft: flags.has("\\Draft"),
    providerLabels: [...flags].filter((f) => !f.startsWith("\\")),
  };
}

export class ImapSyncProvider implements MailSyncProvider {
  async sync({ account, secrets }: SyncContext): Promise<ProviderSyncResult> {
    if (!account.imapHost || !account.username || !secrets.password) {
      throw new Error(`IMAP account ${account.id} is missing host, username, or password`);
    }
    if (account.imapSecurity === "NONE") {
      console.warn(
        `[sync] ${account.emailAddress}: IMAP security is NONE — credentials ` +
          "and mail travel unencrypted. Only use this for localhost bridges.",
      );
    }

    const client = new ImapFlow(imapClientOptions(account, secrets.password));
    await client.connect();
    try {
      // Every selectable mailbox gets synced — Sent/Archive/custom folders
      // are part of the mailbox, not an afterthought.
      const listed = await client.list();
      const mailboxes = listed
        .filter((b) => b.path && !b.flags.has("\\Noselect"))
        .slice(0, MAX_FOLDERS);
      mailboxes.sort((a, b) => (a.path === "INBOX" ? -1 : b.path === "INBOX" ? 1 : 0));

      const storedTokens = parseFolderTokens(account.syncToken);
      const nextTokens: Record<string, string> = { ...storedTokens };
      const messages: RawMessage[] = [];

      for (const box of mailboxes) {
        const folder = folderDisplayName(box.specialUse, box.path, box.delimiter || "/");
        try {
          const lock = await client.getMailboxLock(box.path);
          try {
            const mailbox = client.mailbox;
            if (!mailbox) continue;

            const { uidValidity, lastUid } = parseSyncToken(storedTokens[box.path]);
            const resync = uidValidity !== undefined && uidValidity !== Number(mailbox.uidValidity);
            const sinceUid = resync ? 0 : lastUid;

            const found = mailbox.exists
              ? (await client.search({ uid: `${sinceUid + 1}:*` }, { uid: true })) || []
              : [];
            // Bound both first-sync and bursty incremental ranges; the token
            // advances past skipped mail so the next cycle keeps moving.
            const cap = sinceUid === 0 ? INITIAL_SYNC_LIMIT : MAX_MESSAGES_PER_FOLDER;
            const uids = found.length > cap ? found.slice(-cap) : found;
            let maxUid = sinceUid;
            const fetchedNew = new Set<number>();

            if (uids.length > 0) {
              for await (const msg of client.fetch(
                uids.join(","),
                {
                  uid: true,
                  envelope: true,
                  flags: true,
                  internalDate: true,
                  size: true,
                  source: true,
                },
                { uid: true },
              )) {
                if (!msg.source) continue;
                const parsed = await simpleParser(msg.source);
                // INBOX keeps its historical id scheme so existing rows
                // dedupe; other folders carry the path to avoid UID clashes.
                const providerMessageId =
                  box.path === "INBOX" ? `uid-${msg.uid}` : `uid-${box.path}-${msg.uid}`;
                messages.push(toRawMessage({ msg, parsed }, providerMessageId, folder));
                fetchedNew.add(msg.uid);
                if (msg.uid > maxUid) maxUid = msg.uid;
              }
            }

            // Flags-only refresh of the recent already-synced tail — picks up
            // reads/stars done in other clients without re-downloading bodies.
            if (sinceUid > 0 && mailbox.exists) {
              const windowStart = Math.max(1, sinceUid - FLAG_REFRESH_WINDOW + 1);
              const refreshUids = await client.search(
                { uid: `${windowStart}:${sinceUid}` },
                { uid: true },
              );
              const pending = (refreshUids || []).filter((u) => !fetchedNew.has(u));
              if (pending.length > 0) {
                for await (const msg of client.fetch(
                  pending.join(","),
                  { uid: true, envelope: true, flags: true, internalDate: true },
                  { uid: true },
                )) {
                  const providerMessageId =
                    box.path === "INBOX" ? `uid-${msg.uid}` : `uid-${box.path}-${msg.uid}`;
                  messages.push(envelopeToRawMessage(msg, providerMessageId, folder));
                }
              }
            }

            nextTokens[box.path] = `${mailbox.uidValidity}:${maxUid}`;
          } finally {
            lock.release();
          }
        } catch (err) {
          // One unreadable mailbox shouldn't sink the whole sync — the next
          // cycle retries it while the others keep their advanced tokens.
          console.error(`[sync] IMAP folder ${box.path} failed for ${account.id}:`, err);
        }
      }

      return { messages, nextSyncToken: JSON.stringify(nextTokens) };
    } finally {
      await client.logout();
    }
  }
}
