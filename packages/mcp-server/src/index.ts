#!/usr/bin/env node
/**
 * Dzong Mail MCP server — exposes the local mailbox to MCP-compatible
 * agents (Claude Desktop, Cursor, etc.) over stdio. Every tool is a thin,
 * read-authenticated wrapper over the web app's /api/v1 endpoints, so the
 * agent only ever talks to the user's own machine.
 *
 * Env:
 *   DZONG_BASE_URL   default http://localhost:3000
 *   DZONG_API_TOKEN  Bearer token if the API is locked down (docs/API.md)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (process.env.DZONG_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.DZONG_API_TOKEN;

async function api<T = unknown>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
  return data;
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
  };
}

const server = new McpServer({ name: "dzong-mail", version: "0.1.0" });

server.registerTool(
  "dzong_list_accounts",
  { description: "List connected mail accounts (provider, address, sync status, message count)." },
  async () => ok(await api("GET", "/accounts")),
);

server.registerTool(
  "dzong_list_messages",
  {
    description:
      "List messages. Filter by view (inbox/starred/snoozed/drafts/sent/archive/newsletters/digest), " +
      "keyword q, label, or folder. Set semantic=true with q for meaning-based search.",
    inputSchema: {
      view: z
        .enum(["inbox", "starred", "snoozed", "drafts", "sent", "archive", "newsletters", "digest"])
        .optional(),
      q: z.string().optional().describe("Keyword or semantic-search query"),
      semantic: z.boolean().optional().describe("Use embedding search (needs q)"),
      label: z.string().optional(),
      folder: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
  },
  async ({ view, q, semantic, label, folder, limit }) => {
    try {
      const p = new URLSearchParams();
      if (view) p.set("view", view);
      if (q) p.set("q", q);
      if (semantic) p.set("semantic", "1");
      if (label) p.set("label", label);
      if (folder) p.set("folder", folder);
      if (limit) p.set("limit", String(limit));
      return ok(await api("GET", `/messages?${p}`));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "dzong_get_message",
  {
    description: "Fetch a full message: body text plus attachment metadata and download URLs.",
    inputSchema: { id: z.string().describe("Message id") },
  },
  async ({ id }) => {
    try {
      return ok(await api("GET", `/messages/${encodeURIComponent(id)}`));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "dzong_message_action",
  {
    description: "Archive, unarchive, mark read/unread, or star/unstar a message.",
    inputSchema: {
      id: z.string(),
      action: z.enum(["archive", "unarchive", "read", "unread", "star", "unstar"]),
    },
  },
  async ({ id, action }) => {
    try {
      return ok(await api("POST", `/messages/${encodeURIComponent(id)}`, { action }));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "dzong_ask",
  {
    description:
      "Ask a natural-language question about the user's mail. Returns a grounded answer " +
      "with source-message citations (local AI — requires embeddings via Ollama or OpenAI).",
    inputSchema: { question: z.string() },
  },
  async ({ question }) => {
    try {
      return ok(await api("POST", "/ask", { question }));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "dzong_send",
  {
    description:
      "Send an email through a connected account, or schedule it with an ISO scheduledAt. " +
      "Defaults to the first account. Scheduled sends dispatch when the worker runs.",
    inputSchema: {
      to: z.union([z.string(), z.array(z.string())]).describe("Recipient(s)"),
      subject: z.string().optional(),
      body: z.string().optional(),
      cc: z.union([z.string(), z.array(z.string())]).optional(),
      accountId: z.string().optional(),
      scheduledAt: z
        .string()
        .optional()
        .describe("ISO timestamp to schedule instead of sending now"),
    },
  },
  async (input) => {
    try {
      return ok(await api("POST", "/send", input));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "dzong_sync",
  {
    description: "Trigger a mail sync — all sync-enabled accounts, or one by accountId.",
    inputSchema: { accountId: z.string().optional() },
  },
  async ({ accountId }) => {
    try {
      return ok(await api("POST", "/sync", accountId ? { accountId } : {}));
    } catch (err) {
      return fail(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
