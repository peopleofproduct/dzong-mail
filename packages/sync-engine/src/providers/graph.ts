import type {
  MailSyncProvider,
  ProviderSyncResult,
  RawAttachment,
  RawMessage,
  SyncContext,
} from "../types";

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
// Delta sync can theoretically return an account's entire history on first
// connect — cap the messages ingested per cycle and keep paging via the
// stored nextLink token so large mailboxes converge over several syncs.
const MAX_MESSAGES_PER_SYNC = 500;

const GRAPH_API = "https://graph.microsoft.com/v1.0";

const SELECT = [
  "id",
  "conversationId",
  "subject",
  "bodyPreview",
  "from",
  "toRecipients",
  "ccRecipients",
  "receivedDateTime",
  "isRead",
  "isDraft",
  "hasAttachments",
  "internetMessageId",
  "parentFolderId",
  "body",
  "flag",
].join(",");

interface GraphRecipient {
  emailAddress?: { address?: string; name?: string };
}

interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  isRead?: boolean;
  isDraft?: boolean;
  hasAttachments?: boolean;
  internetMessageId?: string;
  parentFolderId?: string;
  flag?: { flagStatus?: string };
  body?: { contentType?: string; content?: string };
  "@removed"?: { reason?: string };
}

interface GraphAttachment {
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
  contentId?: string;
  isInline?: boolean;
  contentBytes?: string; // base64, fileAttachment only
}

interface GraphDeltaPage {
  value?: GraphMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

interface GraphFolder {
  id: string;
  displayName?: string;
  childFolderCount?: number;
}

function recipients(list: GraphRecipient[] | undefined): string[] {
  return (list ?? []).map((r) => r.emailAddress?.address).filter((a): a is string => Boolean(a));
}

/**
 * Microsoft Graph delta sync. The full deltaLink/nextLink URL doubles as the
 * syncToken, so token management stays stateless on our side.
 */
export class GraphSyncProvider implements MailSyncProvider {
  async sync({ account, secrets }: SyncContext): Promise<ProviderSyncResult> {
    if (!secrets.oauthAccessToken) {
      throw new Error(`Microsoft account ${account.id} has no OAuth access token`);
    }
    const headers = { Authorization: `Bearer ${secrets.oauthAccessToken}` };

    // Resolve folder ids to display names once per sync — the message's
    // parentFolderId alone would leak raw Graph ids into the UI.
    const folderNames = await this.fetchFolderNames(headers);

    let url = account.syncToken ?? `${GRAPH_API}/me/messages/delta?$select=${SELECT}&$top=50`;

    const messages: RawMessage[] = [];
    const deletedIds: string[] = [];
    let nextToken: string | undefined;

    while (url) {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Graph delta sync failed: ${res.status}`);
      const page = (await res.json()) as GraphDeltaPage;

      // Process the whole page — a deltaLink stored mid-page would silently
      // skip the unprocessed tail of this page on the next sync.
      for (const msg of page.value ?? []) {
        if (msg["@removed"]) {
          deletedIds.push(msg.id);
          continue;
        }
        const attachments = msg.hasAttachments ? await this.fetchAttachments(headers, msg.id) : [];
        messages.push({
          providerMessageId: msg.id,
          threadId: msg.conversationId,
          folder: msg.parentFolderId
            ? (folderNames.get(msg.parentFolderId) ?? msg.parentFolderId)
            : undefined,
          subject: msg.subject,
          snippet: msg.bodyPreview,
          fromAddress: msg.from?.emailAddress?.address ?? "unknown",
          fromName: msg.from?.emailAddress?.name,
          toAddresses: recipients(msg.toRecipients),
          ccAddresses: recipients(msg.ccRecipients),
          bccAddresses: [],
          headers: msg.internetMessageId ? { "Message-ID": msg.internetMessageId } : undefined,
          bodyHtml: msg.body?.contentType === "html" ? msg.body.content : undefined,
          bodyText: msg.body?.contentType === "text" ? msg.body.content : msg.bodyPreview,
          attachments,
          receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
          isRead: msg.isRead ?? false,
          isStarred: msg.flag?.flagStatus === "flagged",
          isDraft: msg.isDraft ?? false,
          providerLabels: [],
        });
      }

      if (page["@odata.deltaLink"]) {
        nextToken = page["@odata.deltaLink"];
        break;
      }
      nextToken = page["@odata.nextLink"];
      // Storing the nextLink lets the next cycle resume the same delta
      // enumeration exactly where we stopped — the bound applies between
      // pages, never mid-page.
      if (!page["@odata.nextLink"] || messages.length >= MAX_MESSAGES_PER_SYNC) break;
      url = page["@odata.nextLink"];
    }

    return { messages, nextSyncToken: nextToken, deletedProviderIds: deletedIds };
  }

  /** Well-known names plus custom folders, one level deep — enough to label
   *  every folder a message can realistically sit in. */
  private async fetchFolderNames(headers: Record<string, string>): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const res = await fetch(`${GRAPH_API}/me/mailFolders?$top=100&$select=id,displayName`, {
        headers,
      });
      if (!res.ok) return map;
      const data = (await res.json()) as { value?: GraphFolder[] };
      for (const f of data.value ?? []) {
        if (f.id && f.displayName) map.set(f.id, f.displayName);
      }
    } catch {
      /* folder labels are best-effort */
    }
    return map;
  }

  /** fileAttachment resources carry contentBytes inline; over the size cap we
   * record metadata only and leave the file on the server. */
  private async fetchAttachments(
    headers: Record<string, string>,
    messageId: string,
  ): Promise<RawAttachment[]> {
    const res = await fetch(
      `${GRAPH_API}/me/messages/${encodeURIComponent(messageId)}/attachments` +
        `?$select=id,name,contentType,size,contentId,isInline,contentBytes&$top=50`,
      { headers },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { value?: GraphAttachment[] };
    return (data.value ?? []).flatMap((a) => {
      if (!a.name) return [];
      const oversized = (a.size ?? 0) > MAX_ATTACHMENT_BYTES;
      return [
        {
          filename: a.name,
          mimeType: a.contentType,
          sizeBytes: a.size,
          contentId: a.contentId,
          content: a.contentBytes && !oversized ? Buffer.from(a.contentBytes, "base64") : undefined,
        },
      ];
    });
  }
}
