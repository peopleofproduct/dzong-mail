import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { MailSyncProvider, ProviderSyncResult, RawMessage, SyncContext } from "../types";

// syncToken format: "<uidValidity>:<lastUid>" — a mismatch in uidValidity
// forces a full resync per RFC 3501 semantics.
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

        const uids = mailbox.exists
          ? (await client.search({ uid: `${sinceUid + 1}:*` }, { uid: true })) || []
          : [];
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
              sizeBytes: msg.size ?? msg.source.length,
              receivedAt:
                parsed.date ?? (msg.internalDate ? new Date(msg.internalDate) : new Date()),
              isRead: flags.has("\\Seen"),
              isStarred: flags.has("\\Flagged"),
              isDraft: flags.has("\\Draft"),
              providerLabels: [...flags].filter((f) => !f.startsWith("\\")),
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
