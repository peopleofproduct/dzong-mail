# Unwalled Mail — Full Setup Guide

Everything you need to go from `git clone` to a working, AI-powered local
inbox — including the fiddly bits (OAuth apps, app passwords, Postgres
quirks) spelled out step by step.

If you just want the fast path, the README's quick start has it. This doc
is the "why is this not working" companion.

---

## 1. Prerequisites

### Node.js 20+

```bash
node --version   # must be >= 20
```

We test on Node 24. Any install method is fine — nvm, Homebrew, the
official installer.

### PostgreSQL 14+ (17 recommended)

**macOS:**

```bash
brew install postgresql@17
brew services start postgresql@17
createdb unwalled_mail
```

Homebrew's Postgres creates a superuser matching your macOS username
(e.g. `ganesha`), not the conventional `postgres` user. Either adjust
`DATABASE_URL` to match (`postgresql://ganesha@localhost:5432/unwalled_mail`)
or create the `postgres` role:

```bash
createuser -s postgres
psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
```

**Debian/Ubuntu:**

```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres createdb unwalled_mail
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
```

**Docker (any OS):**

```bash
docker run -d --name unwalled-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=unwalled_mail \
  -p 5432:5432 postgres:17
```

### Ollama (optional — for free local AI)

```bash
# macOS
brew install ollama && brew services start ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: install from ollama.com, it runs as a tray app
```

Then pull a model:

```bash
ollama pull llama3.2:3b        # ~2 GB, good starter — fast, decent
ollama pull nomic-embed-text   # ~274 MB — powers semantic search / Ask
# beefier: ollama pull llama3.1:8b / qwen2.5:7b (better drafts, slower)
```

Verify it's alive: `curl http://localhost:11434/api/tags` should list
your models.

---

## 2. Install & first run

```bash
git clone <repo-url> && cd unwalled-mail
npm install

cp packages/database/.env.example packages/database/.env
# edit DATABASE_URL if your Postgres credentials differ

npm run db:migrate     # creates all tables
npm run db:seed        # demo user + demo account + mock mail
npm run dev            # → http://localhost:3000
```

### Optional but recommended: set a real secret key

Stored credentials (OAuth tokens, IMAP passwords, API keys) are encrypted
with AES-256-GCM. Without a key, a built-in development key is used with
a warning — fine for trying it out, not fine for real mail.

```bash
openssl rand -hex 32
```

Put it in `apps/web/.env.local`:

```
UNWALLED_SECRET_KEY=<the 64-char hex you just generated>
```

**Set this before connecting real accounts.** Rotating it later orphans
previously encrypted secrets.

Two other optional variables go in the same file:

```
# Where attachment files are stored (default: ~/.unwalled-mail)
UNWALLED_DATA_DIR=/path/to/data

# Require Bearer auth on the /api/v1/* endpoints (docs/API.md)
UNWALLED_API_TOKEN=some-long-random-string
```

---

## 3. Connecting real email accounts

All of this happens in **Settings → Accounts**.

### Option A — IMAP/SMTP (the universal path)

Works with Fastmail, Zoho, iCloud, Gmail (app password), Yahoo,
self-hosted Dovecot, Proton Mail Bridge — basically everything.

| Field    | What goes in it                                                            |
| -------- | -------------------------------------------------------------------------- |
| Host     | `imap.fastmail.com`, `imap.mail.me.com`, `127.0.0.1` (Proton Bridge), etc. |
| Port     | `993` (SSL) or `143` (STARTTLS)                                            |
| Username | your full email address                                                    |
| Password | an **app-specific password**, NOT your login password                      |
| SMTP     | same idea — `smtp.<provider>.com`, port 465 or 587                         |

Provider cheat sheet:

- **Gmail:** needs 2FA on, then Google Account → Security → App passwords.
  IMAP host `imap.gmail.com:993`, SMTP `smtp.gmail.com:465`.
- **Fastmail:** Settings → Privacy & Security → Integrations → New app
  password. `imap.fastmail.com:993`.
- **iCloud:** appleid.apple.com → Sign-In & Security → App-Specific
  Passwords. `imap.mail.me.com:993`.
- **Proton:** install Proton Mail Bridge, run it locally, use the
  Bridge-generated password against `127.0.0.1:1143`.
- **Microsoft/Outlook.com personal:** `outlook.office365.com:993` with an
  app password (2FA required), or use OAuth below.

### Option B — Gmail OAuth (proper Gmail API sync)

You create your own OAuth app in Google Cloud — your keys, your consent
screen, your data. ~5 minutes:

1. [console.cloud.google.com](https://console.cloud.google.com) → new
   project (name it anything, e.g. "unwalled-mail")
2. **APIs & Services → Library** → enable **Gmail API**
3. **OAuth consent screen** → External → fill in app name + your email →
   add scope `.../auth/gmail.modify` (read/modify/send — needed for
   labels, send, archive) → add yourself as a test user
4. **Credentials → Create → OAuth client ID** → type **Web application**
   → authorized redirect URI: `http://localhost:3000/api/oauth/google/callback`
5. Copy the client ID + secret into the app's Google connect form →
   Connect → authorize in the Google popup

Unverified-app warning on consent? Expected — click through (it's your
own app, only you use it).

### Option C — Microsoft OAuth (Outlook/M365)

1. [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID →
   App registrations → New registration**
2. Redirect URI (Web): `http://localhost:3000/api/oauth/microsoft/callback`
3. **Certificates & secrets → New client secret** → copy the value
4. **API permissions → Add → Microsoft Graph → Delegated:** `Mail.Read`,
   `Mail.Send`, `Mail.ReadWrite`, `offline_access`, `openid`, `email`
5. Paste client ID + secret into the app's Microsoft connect form →
   Connect

---

## 4. Enabling the AI

**Settings → AI engine:**

- **Ollama (default):** provider `OLLAMA`, base URL
  `http://localhost:11434`, model e.g. `llama3.2:3b` (must match what you
  pulled). Toggle **Enable** → Save.
- **OpenAI:** provider `OPENAI`, paste `sk-...` key, model e.g.
  `gpt-4o-mini`.
- **Anthropic:** provider `ANTHROPIC`, paste `sk-ant-...` key, model e.g.
  `claude-sonnet-4-5`. Note: no embeddings endpoint — semantic features
  will need Ollama/OpenAI for embeddings.

Optional knobs: temperature (0.1–0.3 recommended for labels/rules),
custom labels (comma-separated — the classifier can use them), embedding
model.

Once enabled, open any thread: **✦ Summarize** and **✦ Draft reply**
light up, sync runs auto-classify new mail, and **Settings → Rules**
gains the plain-English rule generator + cold-email preset.

Quick smoke test from the repo root:

```bash
npx tsx scripts/enable-ai.ts   # enables AI for the local user and
                               # exercises classify/summarize/draft/NL-rule
```

---

## 5. Troubleshooting

| Symptom                               | Likely fix                                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Can't reach database server`         | Postgres not running (`brew services start postgresql@17` / `systemctl start postgresql`), or wrong `DATABASE_URL` credentials               |
| `P1001` / auth failed                 | Homebrew Postgres has no `postgres` user — use your username in `DATABASE_URL` or `createuser -s postgres`                                   |
| AI buttons do nothing / "AI disabled" | Settings → AI engine isn't enabled, or Ollama isn't running (`ollama serve`), or the model name doesn't match a pulled model (`ollama list`) |
| OAuth callback error                  | Redirect URI in the Google/Azure app doesn't match `http://localhost:3000/api/oauth/<provider>/callback` exactly                             |
| IMAP auth failure                     | Using your login password instead of an app-specific password (nearly every provider requires this now)                                      |
| `Unknown argument isArchived` etc.    | Stale Prisma client in a running dev server — `npm run db:generate` and restart `npm run dev`                                                |
| `UNWALLED_SECRET_KEY` warnings        | Set a real key in `apps/web/.env.local` (see §2)                                                                                             |

## 6. Useful scripts

```bash
npm run db:migrate     # apply migrations
npm run db:seed        # demo user/account + mock mail
npm run dev            # everything (web + watchers)
npm run worker         # background loop: scheduled sends, snooze returns,
                       # periodic sync + AI classification (env knobs:
                       # WORKER_TICK_MS, WORKER_SYNC_INTERVAL_MS)
npm run typecheck      # strict TS across workspaces
npm run lint           # eslint
npm run build          # production build
npx tsx scripts/enable-ai.ts   # enable AI + exercise every AI path
```
