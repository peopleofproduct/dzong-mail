import type { MailSyncProvider, ProviderSyncResult, RawMessage, SyncContext } from "../types";

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
  parentFolderId?: string;
  body?: { contentType?: string; content?: string };
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
}
