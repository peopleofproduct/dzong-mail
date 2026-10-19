# MCP server — let agents drive your inbox

`packages/mcp-server` exposes the local mailbox over MCP (Model Context
Protocol), so agent tools like Claude Desktop, Cursor, or your own scripts can
search, read, triage, and send mail through your local instance — without the
mail ever leaving your machine.

It speaks stdio and wraps the same `/api/v1` HTTP API documented in
[API.md](API.md), so the web app (`npm run dev`) must be running.

## Tools exposed

| Tool                      | What it does                                                     |
| ------------------------- | ---------------------------------------------------------------- |
| `unwalled_list_accounts`  | Connected accounts + sync status + message counts                |
| `unwalled_list_messages`  | List/filter mail — views, keyword search, semantic search, label |
| `unwalled_get_message`    | Full body + attachment metadata/download URLs                    |
| `unwalled_message_action` | `archive` `unarchive` `read` `unread` `star` `unstar`            |
| `unwalled_ask`            | Natural-language answers with source citations                   |
| `unwalled_send`           | Send or schedule (ISO `scheduledAt`) through a connected account |
| `unwalled_sync`           | Trigger a sync — all accounts or one                             |

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or the equivalent on your platform:

```json
{
  "mcpServers": {
    "unwalled-mail": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/unwalled-mail/packages/mcp-server/src/index.ts"],
      "env": {
        "UNWALLED_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

If you set `UNWALLED_API_TOKEN` on the web app (see API.md), add the same
token to the `env` block.

Restart Claude Desktop, then try: _"search my inbox for receipts"_ or _"ask my
inbox what Alice said about the launch."_

## Running standalone

```bash
npm run mcp   # from the repo root — speaks stdio, so it's quiet until a client connects
```

## Security posture

Same rules as the HTTP API: it's a local control surface on your own machine.
It inherits `UNWALLED_API_TOKEN` if you enable it, sends nothing to us, and
the tools that mutate mail (`send`, `message_action`, `sync`) go through the
same code paths the UI uses — drafts you haven't reviewed still require your
approval in the app before sending, unless an agent explicitly calls
`unwalled_send` itself. Only connect MCP clients you trust with your mailbox.
