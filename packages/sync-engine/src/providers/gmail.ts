import type {
  MailSyncProvider,
  ProviderSyncResult,
  RawAttachment,
  RawMessage,
  SyncContext,
} from "../types";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_MESSAGES = 100;
const METADATA_HEADERS = ["Subject", "From", "To", "Cc", "Date", "Message-ID"];

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailBodyPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailBodyPart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  sizeEstimate?: number;
  payload?: { headers?: GmailHeader[] } & GmailBodyPart;
}

function decodeBody(data: string | undefined): string | undefined {
  if (!data) return undefined;
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

function extractBodies(part: GmailBodyPart | undefined): {
  text?: string;
  html?: string;
} {
  if (!part) return {};
  if (part.mimeType === "text/plain") return { text: decodeBody(part.body?.data) };
  if (part.mimeType === "text/html") return { html: decodeBody(part.body?.data) };
  const out: { text?: string; html?: string } = {};
  for (const child of part.parts ?? []) {
    const found = extractBodies(child);
    out.text ??= found.text;
    out.html ??= found.html;
  }
  return out;
}

/** Parts carrying a filename are attachments (or inline bodies saved as files). */
function collectAttachmentParts(part: GmailBodyPart | undefined, out: GmailBodyPart[] = []) {
  if (!part) return out;
  if (part.filename && part.filename.length > 0) out.push(part);
  for (const child of part.parts ?? []) collectAttachmentParts(child, out);
  return out;
}

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function b64urlToBuffer(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

interface GmailHistoryEntry {
  messagesAdded?: Array<{ message: { id: string } }>;
  messagesDeleted?: Array<{ message: { id: string } }>;
  labelsAdded?: Array<{ message: { id: string } }>;
  labelsRemoved?: Array<{ message: { id: string } }>;
}

// Beyond messageAdded: label changes surface remote reads/archives/label
// moves, and deletions let us mirror server-side removal locally.
const HISTORY_TYPES = ["messageAdded", "labelsAdded", "labelsRemoved", "messagesDeleted"];

/** Map Gmail's label model to a display folder. */
function gmailFolder(labels: string[]): string {
  if (labels.includes("INBOX")) return "INBOX";
  if (labels.includes("SENT")) return "Sent";
  if (labels.includes("DRAFT")) return "Drafts";
  if (labels.includes("TRASH")) return "Trash";
  if (labels.includes("SPAM")) return "Spam";
  return labels[0] ?? "All Mail";
}

/** Gmail archives by removing INBOX — mirror that onto the local flag so
 *  mail the user archived in Gmail doesn't pop back into the local inbox. */
function gmailIsArchived(labels: string[]): boolean {
  return (
    !labels.includes("INBOX") &&
    !labels.includes("SENT") &&
    !labels.includes("DRAFT") &&
    !labels.includes("TRASH")
  );
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

function parseAddressHeader(raw: string | undefined): { address: string; name?: string } {
  if (!raw) return { address: "unknown" };
  const match = /^(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?/.exec(raw.trim());
  return match
    ? { address: match[2], name: match[1]?.trim() || undefined }
    : { address: raw.trim() };
}

function parseAddressList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => parseAddressHeader(part).address)
    .filter(Boolean);
}

export class GmailSyncProvider implements MailSyncProvider {
  async sync({ account, secrets }: SyncContext): Promise<ProviderSyncResult> {
    if (!secrets.oauthAccessToken) {
      throw new Error(`Gmail account ${account.id} has no OAuth access token`);
    }
    const auth = { Authorization: `Bearer ${secrets.oauthAccessToken}` };

    const get = async (path: string): Promise<Response> =>
      fetch(`${GMAIL_API}${path}`, { headers: auth });

    // Snapshot the current historyId up front; it becomes the next syncToken
    // so messages arriving mid-sync are picked up on the following run.
    const profileRes = await get("/profile?fields=historyId");
    if (!profileRes.ok) throw new Error(`Gmail profile fetch failed: ${profileRes.status}`);
    const historyId = ((await profileRes.json()) as { historyId?: string }).historyId;

    const ids = new Set<string>();
    const deletedIds: string[] = [];

    if (account.syncToken) {
      // Incremental: walk history.list for every mutation type — new mail,
      // label moves (read/archive/custom), and deletions.
      let pageToken: string | undefined;
      let historyExpired = false;
      do {
        const params = new URLSearchParams({
          startHistoryId: account.syncToken,
          maxResults: "500",
        });
        for (const type of HISTORY_TYPES) params.append("historyTypes", type);
        if (pageToken) params.set("pageToken", pageToken);
        const res = await get(`/history?${params}`);
        if (res.status === 404) {
          historyExpired = true;
          break;
        }
        if (!res.ok) throw new Error(`Gmail history.list failed: ${res.status}`);
        const data = (await res.json()) as {
          history?: GmailHistoryEntry[];
          nextPageToken?: string;
        };
        for (const entry of data.history ?? []) {
          for (const added of entry.messagesAdded ?? []) ids.add(added.message.id);
          for (const added of entry.labelsAdded ?? []) ids.add(added.message.id);
          for (const removed of entry.labelsRemoved ?? []) ids.add(removed.message.id);
          for (const removed of entry.messagesDeleted ?? []) deletedIds.push(removed.message.id);
        }
        pageToken = data.nextPageToken;
      } while (pageToken);

      if (!historyExpired) {
        return this.fetchMessages(get, [...ids], historyId, deletedIds);
      }
      // History too old — fall through to a bounded full listing.
    }

    // Bounded listing across INBOX and SENT so a fresh connect captures the
    // outbound side too (a history-expired resync hits this path as well).
    for (const label of ["INBOX", "SENT"] as const) {
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          maxResults: String(MAX_MESSAGES),
          labelIds: label,
        });
        if (pageToken) params.set("pageToken", pageToken);
        const res = await get(`/messages?${params}`);
        if (!res.ok) throw new Error(`Gmail messages.list failed: ${res.status}`);
        const data = (await res.json()) as {
          messages?: Array<{ id: string }>;
          nextPageToken?: string;
        };
        for (const m of data.messages ?? []) ids.add(m.id);
        pageToken = data.nextPageToken;
      } while (pageToken && ids.size < MAX_MESSAGES * 2);
    }

    return this.fetchMessages(get, [...ids], historyId, deletedIds);
  }

  private async fetchMessages(
    get: (path: string) => Promise<Response>,
    ids: string[],
    historyId: string | undefined,
    deletedIds: string[] = [],
  ): Promise<ProviderSyncResult> {
    const messages: RawMessage[] = [];
    for (const id of ids.slice(0, MAX_MESSAGES * 2)) {
      const params = new URLSearchParams({ format: "full" });
      const res = await get(`/messages/${id}?${params}`);
      if (!res.ok) continue;
      const msg = (await res.json()) as GmailMessage;
      const headers = msg.payload?.headers?.filter((h) =>
        METADATA_HEADERS.some((w) => w.toLowerCase() === h.name.toLowerCase()),
      );
      const bodies = extractBodies(msg.payload);
      const from = parseAddressHeader(headerValue(headers, "From"));
      const labels = msg.labelIds ?? [];

      const attachments: RawAttachment[] = [];
      for (const part of collectAttachmentParts(msg.payload)) {
        const filename = part.filename;
        if (!filename) continue;
        const size = part.body?.size;
        if (size !== undefined && size > MAX_ATTACHMENT_BYTES) {
          attachments.push({ filename, mimeType: part.mimeType, sizeBytes: size });
          continue;
        }
        let content: Buffer | undefined;
        if (part.body?.data) {
          content = b64urlToBuffer(part.body.data);
        } else if (part.body?.attachmentId) {
          const attRes = await get(`/messages/${msg.id}/attachments/${part.body.attachmentId}`);
          if (attRes.ok) {
            const attData = (await attRes.json()) as { data?: string };
            if (attData.data) content = b64urlToBuffer(attData.data);
          }
        }
        attachments.push({
          filename,
          mimeType: part.mimeType,
          sizeBytes: size ?? content?.length,
          content,
        });
      }

      messages.push({
        providerMessageId: msg.id,
        threadId: msg.threadId,
        folder: gmailFolder(labels),
        subject: headerValue(headers, "Subject"),
        snippet: msg.snippet,
        fromAddress: from.address,
        fromName: from.name,
        toAddresses: parseAddressList(headerValue(headers, "To")),
        ccAddresses: parseAddressList(headerValue(headers, "Cc")),
        bccAddresses: [],
        headers: Object.fromEntries((headers ?? []).map((h) => [h.name, h.value])),
        bodyText: bodies.text,
        bodyHtml: bodies.html,
        attachments,
        sizeBytes: msg.sizeEstimate,
        receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
        isRead: !labels.includes("UNREAD"),
        isStarred: labels.includes("STARRED"),
        isDraft: labels.includes("DRAFT"),
        isArchived: gmailIsArchived(labels),
        providerLabels: labels,
      });
    }
    return { messages, nextSyncToken: historyId, deletedProviderIds: deletedIds };
  }
}
