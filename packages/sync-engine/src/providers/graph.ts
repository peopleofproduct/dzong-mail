import type {
  MailSyncProvider,
  ProviderSyncResult,
  RawAttachment,
  RawMessage,
  SyncContext,
} from "../types";

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

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
  parentFolderId?: string;
  body?: { contentType?: string; content?: string };
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

function recipients(list: GraphRecipient[] | undefined): string[] {
  return (list ?? []).map((r) => r.emailAddress?.address).filter((a): a is string => Boolean(a));
}

/**
 * Microsoft Graph delta sync. The full deltaLink URL doubles as the syncToken,
 * so token management stays entirely stateless on our side.
 */
export class GraphSyncProvider implements MailSyncProvider {
  async sync({ account, secrets }: SyncContext): Promise<ProviderSyncResult> {
    if (!secrets.oauthAccessToken) {
      throw new Error(`Microsoft account ${account.id} has no OAuth access token`);
    }
    const headers = { Authorization: `Bearer ${secrets.oauthAccessToken}` };

    let url =
      account.syncToken ??
      `${GRAPH_API}/me/mailFolders/inbox/messages/delta?$select=${SELECT}&$top=50`;

    const messages: RawMessage[] = [];
    let deltaLink: string | undefined;

    while (url) {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Graph delta sync failed: ${res.status}`);
      const page = (await res.json()) as GraphDeltaPage;

      for (const msg of page.value ?? []) {
        if ("@removed" in msg) continue;
        const attachments = msg.hasAttachments ? await this.fetchAttachments(headers, msg.id) : [];
        messages.push({
          providerMessageId: msg.id,
          threadId: msg.conversationId,
          folder: msg.parentFolderId,
          subject: msg.subject,
          snippet: msg.bodyPreview,
          fromAddress: msg.from?.emailAddress?.address ?? "unknown",
          fromName: msg.from?.emailAddress?.name,
          toAddresses: recipients(msg.toRecipients),
          ccAddresses: recipients(msg.ccRecipients),
          bccAddresses: [],
          bodyHtml: msg.body?.contentType === "html" ? msg.body.content : undefined,
          bodyText: msg.body?.contentType === "text" ? msg.body.content : msg.bodyPreview,
          attachments,
          receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
          isRead: msg.isRead ?? false,
          isStarred: false,
          isDraft: msg.isDraft ?? false,
          providerLabels: [],
        });
      }

      url = page["@odata.nextLink"] ?? "";
      if (page["@odata.deltaLink"]) {
        deltaLink = page["@odata.deltaLink"];
        break;
      }
    }

    return { messages, nextSyncToken: deltaLink };
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
