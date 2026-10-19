import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { MailSyncProvider, ProviderSyncResult, RawMessage, SyncContext } from "../types";

// syncToken format: "<uidValidity>:<lastUid>" — a mismatch in uidValidity
// forces a full resync per RFC 3501 semantics.
const INITIAL_SYNC_LIMIT = 200;
function parseSyncToken(token: string | null): { uidValidity?: number; lastUid: number } {
  if (!token) return { lastUid: 0 };
  const [validity, uid] = token.split(":");
  return { uidValidity: Number(validity) || undefined, lastUid: Number(uid) || 0 };
}

function addressList(value: { address?: string; name?: string }[] | undefined): string[] {
  return (value ?? []).map((v) => v.address).filter((a): a is string => Boolean(a));
}

export class ImapSyncProvider implements MailSyncProvider {
  async sync({ account, secrets }: SyncContext): Promise<ProviderSyncResult> {
    if (!account.imapHost || !account.username || !secrets.password) {
      throw new Error(`IMAP account ${account.id} is missing host, username, or password`);
    }

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort ?? 993,
      secure: account.imapSecurity !== "STARTTLS" && account.imapSecurity !== "NONE",
      auth: { user: account.username, pass: secrets.password },
      logger: false,
    });

    await client.connect();
    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const mailbox = client.mailbox;
        if (!mailbox) throw new Error("IMAP mailbox did not open");

        const { uidValidity, lastUid } = parseSyncToken(account.syncToken);
        const resync = uidValidity !== undefined && uidValidity !== Number(mailbox.uidValidity);
        const sinceUid = resync ? 0 : lastUid;

        const found = mailbox.exists
          ? (await client.search({ uid: `${sinceUid + 1}:*` }, { uid: true })) || []
          : [];
        // On a first/forced resync, a real mailbox can hold tens of thousands
        // of messages — fetching full source for all of them would melt the
        // first connect. Bound it to the newest N; the token advances past
        // the skipped range so they can be backfilled later by design.
        const uids =
          sinceUid === 0 && found.length > INITIAL_SYNC_LIMIT
            ? found.slice(-INITIAL_SYNC_LIMIT)
            : found;
        const messages: RawMessage[] = [];
        let maxUid = sinceUid;

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
            const flags = msg.flags ?? new Set<string>();
            const parsed = await simpleParser(msg.source);
            const references = parsed.references
              ? Array.isArray(parsed.references)
                ? parsed.references[0]
                : parsed.references
              : undefined;

            // Keep the headers needed for reply threading and the Gmail-style
            // details popover (mailed-by / signed-by / TLS). Received is a
            // multi-value header; the first entry is the final delivery hop.
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
            ]) {
              const v = hdr(name.toLowerCase());
              if (v) headers[name] = v;
            }

            messages.push({
              providerMessageId: `uid-${msg.uid}`,
              threadId: references ?? parsed.inReplyTo ?? parsed.messageId ?? undefined,
              folder: "INBOX",
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
                // mailparser marks every non-text part an attachment, so
                // inline text/calendar invites arrive here too.
                filename: a.filename ?? (a.contentType === "text/calendar" ? "invite.ics" : "attachment"),
                mimeType: a.contentType,
                sizeBytes: a.size,
                contentId: a.cid,
                content: a.content,
              })),
              sizeBytes: msg.size ?? msg.source.length,
              receivedAt:
                parsed.date ?? (msg.internalDate ? new Date(msg.internalDate) : new Date()),
              isRead: flags.has("\\Seen"),
              isStarred: flags.has("\\Flagged"),
              isDraft: flags.has("\\Draft"),
              providerLabels: [...flags].filter((f) => !f.startsWith("\\")),
              headers,
            });
            if (msg.uid > maxUid) maxUid = msg.uid;
          }
        }

        return {
          messages,
          nextSyncToken: `${mailbox.uidValidity}:${maxUid}`,
        };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }
}
