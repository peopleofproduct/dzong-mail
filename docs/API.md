# Local HTTP API

Dzong Mail exposes a small REST API at `/api/v1/*` while the web app is
running (`npm run dev` → `http://localhost:3000`). It exists so scripts, agents,
and other local tools can read and act on your mailbox without touching the UI.

Everything stays on your machine — the API reads the same local Postgres and
local files the UI does, and it only listens on your dev server.

## Auth

Open by default (loopback only). To lock it down, set a token:

```bash
DZONG_API_TOKEN="some-long-random-string" npm run dev
```

Then send it as a Bearer token:

```bash
curl -H "Authorization: Bearer $DZONG_API_TOKEN" http://localhost:3000/api/v1/accounts
```

## Endpoints

### `GET /api/v1/accounts`

Connected mail accounts.

```json
{
  "accounts": [
    {
      "id": "…",
      "emailAddress": "me@example.com",
      "provider": "IMAP_SMTP",
      "isActive": true,
      "syncEnabled": true,
      "lastSyncedAt": "…",
      "messageCount": 128
    }
  ]
}
```

### `GET /api/v1/messages`

List mail. Query params:

| Param      | Values                                                                       | Default |
| ---------- | ---------------------------------------------------------------------------- | ------- |
| `view`     | `inbox` `starred` `snoozed` `drafts` `sent` `archive` `newsletters` `digest` | `inbox` |
| `q`        | keyword search (subject, sender, snippet, body)                              | —       |
| `semantic` | `1` → embedding-based search (requires `q`)                                  | off     |
| `label`    | filter by label or AI label                                                  | —       |
| `folder`   | filter by provider folder                                                    | —       |
| `limit`    | 1–200                                                                        | 50      |

```bash
curl "http://localhost:3000/api/v1/messages?view=inbox&limit=10"
curl "http://localhost:3000/api/v1/messages?semantic=1&q=weekend+plans"
```

### `GET /api/v1/messages/{id}`

Full message: headers, `bodyText`, and attachments with `downloadUrl`s.

### `POST /api/v1/messages/{id}`

Mutate a message:

```json
{ "action": "archive" }
```

Actions: `archive`, `unarchive`, `read`, `unread`, `star`, `unstar`.

### `POST /api/v1/send`

Send (or schedule) through a connected account:

```json
{ "to": "alice@example.com", "subject": "Hi", "body": "…" }
```

`to`/`cc` accept a string or array. `accountId` defaults to the first account.
`scheduledAt` (ISO timestamp) stores it as a scheduled draft — the worker
(`npm run worker`) dispatches it when due.

### `POST /api/v1/sync`

Trigger a sync. `{}` syncs all enabled accounts; `{"accountId": "…"}` syncs one.

### `POST /api/v1/ask`

Grounded natural-language answers over local mail (needs a working AI provider
with embeddings — Ollama or OpenAI):

```bash
curl -X POST http://localhost:3000/api/v1/ask \
  -H 'Content-Type: application/json' \
  -d '{"question": "what did Alice say about weekend plans?"}'
```

→ `{ "answer": "Alice said the weather looks great for Saturday…", "sources": [{ "messageId": "…", "subject": "…" }] }`

## Attachment downloads

`GET /api/attachments/{id}` streams a stored attachment (linked from each
message's `attachments[].downloadUrl`).

## Notes for agent authors

- Responses are plain JSON; errors are `{"error": "…"}` with a 4xx/5xx status.
- Semantic search and `/ask` need messages embedded first — the worker embeds
  after every sync, or it happens on next search warmup.
- This is a local control surface, not a public API — don't expose port 3000.
