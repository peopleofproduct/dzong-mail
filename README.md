# Unwalled Mail

**Your messages, your models, your machine — no paywalls, ever.**

Unwalled Mail is an open-source, local-first AI email client. It gives you
the features people pay $30/month for — AI labels, pre-drafted replies,
cold-email blocking, bulk unsubscribe, follow-up tracking, natural-language
rules — running entirely on your own computer. Your mail never touches our
servers (we don't have any), and it never trains anyone's model. Including
ours.

Use it with Gmail, Outlook, or **any** IMAP/SMTP provider — Fastmail,
Proton Bridge, Zoho, iCloud, your own Dovecot box. And use it with any AI
brain you like: a fully-offline local model via Ollama, or your own
OpenAI/Anthropic API key.

Free. Open source. MIT. Yours.

---

## What it does

- **A real email client** — three-pane inbox, threads, composer,
  send/reply/forward, drafts, snooze, archive, trash, search, and a full
  keyboard map (press `?` in the app to see every shortcut).
- **AI triage** — incoming mail gets labeled automatically (newsletters,
  receipts, notifications, cold pitches, plus any custom labels you
  invent). Split inbox separates signal from noise.
- **AI that writes for you** — reply drafts matched to the tone of the
  thread, one-click thread summaries, and a "Write with AI" composer.
- **Rules in plain English** — type "archive newsletters from noreply
  senders" and get a real automation rule, with dry-run before it touches
  anything.
- **Cold-email blocker** — one click to auto-archive pitches from
  strangers.
- **Bulk unsubscribe** — see every sender spamming you, ranked, with
  one-click unsubscribe-and-archive.
- **Semantic search + "Ask my inbox"** — meaning-based search (toggle the
  ✦ AI chip next to search) and a chat panel (⌘K → "Ask my inbox") that
  answers questions with citations from your actual mail. All local —
  competitors can't do this without shipping your inbox to a cloud.
- **Digest view** — the week's newsletters and bulk mail rolled up per
  sender, with a one-click AI digest and per-sender cleanup.
- **Draft review** — AI- and human-written drafts get a first-class queue:
  open one, send it as-is, or edit-then-send.
- **Attachments, stored locally** — files land on your disk
  (`~/.unwalled-mail/attachments`), show up in the thread, and download
  straight from the app.
- **A local HTTP API** — `/api/v1/*` endpoints so scripts and other agents
  can search, ask, sync, and send. See [docs/API.md](docs/API.md).
- **Follow-up tracking** — "needs reply" and "awaiting response" views so
  nothing slips.
- **Analytics** — volume, top senders, label breakdown, all computed
  locally.
- **100% local** — Postgres on your machine, bodies on your disk, secrets
  encrypted with a key you hold. Turn on airplane mode: everything still
  works except sync and send.

## What it needs (system requirements)

- **Node.js 20+** and npm
- **PostgreSQL 14+** running locally (14 is the floor; 17 is what we test)
- **Ollama** (optional but recommended) for the local AI — or an
  OpenAI/Anthropic API key
- macOS, Linux, or Windows/WSL — anywhere the above run

## Quick start — five minutes to a working inbox

**One command** (macOS / Debian — installs Postgres + Ollama if missing,
creates the DB, migrates, seeds a demo inbox, pulls models):

```bash
git clone https://github.com/peopleofproduct/unwalled-mail.git
cd unwalled-mail
npm run setup        # add --no-ai to skip Ollama
npm run dev
```

Or step by step:

```bash
# 1. Get the code
git clone https://github.com/peopleofproduct/unwalled-mail.git
cd unwalled-mail
npm install

# 2. Start PostgreSQL and create the database
#    macOS (Homebrew):
brew install postgresql@17 && brew services start postgresql@17
createdb unwalled_mail
#    Linux: install postgresql via your package manager, then `createdb unwalled_mail`

# 3. Point the app at your database
cp packages/database/.env.example packages/database/.env
#    Edit the file if your Postgres user/password differ.
#    Default assumes postgresql://postgres:postgres@localhost:5432/unwalled_mail

# 4. Create the tables and seed a demo account
npm run db:migrate
npm run db:seed

# 5. Run it
npm run dev

# 6. (Optional) the background worker — run in a second terminal
#    Dispatches scheduled sends, returns snoozed mail, and syncs all
#    accounts every 5 minutes + classifies new mail with AI.
npm run worker
```

Open **http://localhost:3000** — you'll see a demo inbox with real
(fake) mail, AI-ready. Try the keys: `j`/`k` to move, `⌘K` for the
command palette, `e` to archive, `r` to reply. Without the worker, sync
happens when you hit Sync in the UI and scheduled sends wait in Drafts.

## Turn on the AI (optional, recommended)

The app works without AI, but the good stuff needs a brain. Two options:

**Option A — fully local & free (Ollama):**

```bash
brew install ollama          # or your platform's install
brew services start ollama   # keeps it running
ollama pull llama3.2:3b      # ~2 GB, once
```

Then in the app: **Settings → AI engine → provider: Ollama → Enable →
Save**. Every AI feature now runs offline, free, forever.

**Option B — bring your own key:** Settings → AI engine → pick OpenAI or
Anthropic, paste your API key (encrypted at rest, never leaves your
machine), choose a model, enable. Note: Anthropic doesn't offer
embeddings, so if future semantic-search features matter, pick OpenAI or
Ollama for the embedding slot.

## Connect a real account

From **Settings → Accounts** (or the connect cards on the home page):

- **IMAP/SMTP (works with almost everyone)** — enter host, port, and an
  app-specific password. Gmail: turn on 2FA then create an app password.
  Fastmail/Zoho/iCloud: app passwords in their security settings. Proton:
  run Proton Mail Bridge locally and point us at it.
- **Gmail OAuth** — create a Google Cloud OAuth client (see
  `docs/SETUP.md` for the 5-minute walkthrough), paste your client
  ID/secret into the connect form, authorize. Same for **Microsoft**.
- **Demo account** — the seeded `demo@unwalled.local` mock provider emits
  mail on every sync; great for poking around without credentials.

> **Honest status note:** the mock provider and local AI pipeline are
> verified end-to-end. The Gmail, Microsoft, and IMAP code paths are
> complete but lightly tested against real mailboxes — early versions may
> have rough edges there. Issues and PRs welcome.

## Every-day usage cheat sheet

| Key                  | Does                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `j` / `k`            | next / previous message                                                                                              |
| `Enter`, `o`         | open thread                                                                                                          |
| `x`, `⇧A`            | select message / select all                                                                                          |
| `e`, `z`             | archive / undo last archive                                                                                          |
| `v` then `i`/`a`/`t` | move to Inbox / Archive / Trash                                                                                      |
| `s`, `u`, `h`        | star / mark read·unread / snooze 24h                                                                                 |
| `r`, `f`, `c`        | reply / forward / compose                                                                                            |
| `⌘⏎`                 | send (in composer)                                                                                                   |
| `g` + letter         | jump: `i` inbox `s` starred `d` drafts `t` sent `a` archive `n` newsletters `r` needs-reply `w` awaiting `z` snoozed |
| `/`, `⌘K`, `?`       | search / command palette / shortcut help                                                                             |

## How it's built

```
apps/web            Next.js 16 + React 19 + Tailwind — the whole UI, local
packages/database   Prisma + PostgreSQL — every byte stays on your disk
packages/sync-engine  Gmail / Graph / IMAP / Mock sync, send pipeline,
                      rules engine, unsubscribe, AI orchestration
packages/ai-engine  Provider abstraction — Ollama, OpenAI, Anthropic
scripts/            seed-demo.ts, enable-ai.ts — dev utilities
```

Everything runs via `npm run dev` (Turborepo). Checks:
`npm run typecheck` · `npm run lint` · `npm run build`.

**Config/env vars** (all optional except `DATABASE_URL`):

- `DATABASE_URL` — in `packages/database/.env`, your local Postgres
- `UNWALLED_SECRET_KEY` — encrypts stored credentials; a dev key is used
  with a warning if unset. Set a real one: `openssl rand -hex 32` into
  `apps/web/.env.local`
- Ollama base URL, model, temperature — all configurable in Settings

## Roadmap — where we're headed

Working today: everything above, plus the `npm run worker` background
loop (scheduled sends, snooze returns, periodic sync + AI classify +
embedding) and a local HTTP API for scripts and agents.
Coming next (roughly in order): real-mailbox hardening on more providers,
and a mobile story via an optional encrypted relay (the one thing
local-first can't do alone — it'll be self-hostable too).

## Contributing

Found a bug, want a feature, fixed something? Issues and PRs are the
product roadmap. See `docs/SETUP.md` for environment details and
`AGENTS.md` for the workspace map.

## License

MIT — do what you want with it. That's the point.
