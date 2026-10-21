<p align="center">
  <img src="apps/web/src/app/icon.svg" width="88" alt="Dzong Mail — fortress-gateway mark" />
</p>

# Dzong Mail

**Your messages, your models, your machine — no paywalls, ever.**

*dzong (རྫོང) — pronounced "jong" — the fortress-monasteries of Bhutan,
where a district's correspondence and governance were kept behind walls
the community itself owned.*

Dzong Mail is an open-source, local-first AI email client. It gives you
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

## Why "Dzong"?

Every mail platform wants you inside *their* walls — their servers, their
terms, their business model. A dzong is different: it's a fortress its own
community builds and governs. Dzongs weren't just defenses — they housed
the district's administration, its records, its correspondence. The word
for Bhutan's national language, Dzongkha, literally means "the language
spoken in the dzong."

That's the thesis: walls aren't the problem — *whose* walls is the
question. Dzong Mail is a fortress for your mail that belongs to you.

---

## What nobody else does

Plenty of products say "AI email" now. Here's what's different about ours —
and why it stays that way.

- **It writes like you write to _them_, not like you in general.**
  Other tools learn "your voice" as one global style. Dzong builds a
  per-recipient profile from your actual shared history — the greeting
  you use with Sam, the sign-off you use with your lawyer, how short you
  keep it with your team — and drafts to match. Open any sender's
  dossier page and you can see exactly what it inferred. Nobody else
  shows you the math.
- **Every AI action explains itself — and asks first when unsure.**
  Each label, draft, and rule application carries a written "why" and a
  confidence score. Below your threshold it queues for your approval
  instead of firing. A cloud service can't do this honestly without
  leaking their model internals; our pipeline is yours.
- **Everything is undoable.** Every automated action is logged in a
  local audit trail with a one-click undo. Trust isn't a marketing
  word here — it's a column in a table you can open.
- **"Ask my inbox" answers on your hardware, with receipts.** Ask a
  question in plain words and get a streamed answer grounded in cited
  mail — plus findings you can act on (mark all read, archive all, jump
  to the sender). With Ollama it works on a plane. Competitors can't do
  this without shipping your inbox to their cloud.
- **It works offline, for real.** Turn on airplane mode: search, ask,
  drafts, summaries, labels — all still running, because the model is
  local too. Not an offline "mode." There is no server to be offline
  from.
- **Your mail, portable.** One click exports any account as standard
  mbox — readable by Thunderbird and everything else. The only email
  product with an incentive to make leaving easy.

## The daily-driver stuff (that you'd pay $30/month for elsewhere)

- **A real email client** — three-pane inbox, threads, composer with
  rich text and snippets, send/reply/forward, drafts, snooze, send
  later, undo send, archive, trash, and a full keyboard map (press `?`).
  Installable as an app (PWA) on desktop and mobile.
- **AI triage** — incoming mail gets labeled automatically (newsletters,
  receipts, notifications, cold pitches, plus any custom labels you
  invent). Split inbox separates signal from noise.
- **AI that writes for you** — reply drafts in the recipient's voice
  profile, three variants to pick from, one-click thread summaries, and
  a "Write with AI" composer.
- **Rules in plain English** — type "archive newsletters from noreply
  senders" and get a real automation rule, with dry-run before it
  touches anything.
- **Cold-email blocker + bulk unsubscribe** — one click to auto-archive
  pitches from strangers; every sender spamming you, ranked, with
  one-click unsubscribe-and-archive.
- **Search that finds mail by meaning** — type a question in the search
  bar and the assistant takes over; type keywords and the instant index
  answers. Powered by a local meaning index (pgvector-accelerated when
  available), honest keyword fallback when not.
- **Follow-ups that don't slip** — "needs reply" / "awaiting response"
  views, timed nudges, and auto-follow-ups that send at the hour each
  recipient actually tends to reply.
- **Relationship dossiers** — click any sender: exchange counts, reply
  speed both ways, open loops, files exchanged, upcoming meetings with
  them.
- **Calendar-aware** — `.ics` invites land on a local calendar with
  attendees and recurrences; send-at-a-meeting conflicts get flagged.
- **Digest view** — the week's newsletters rolled up per sender, with a
  one-click AI digest and per-sender cleanup.
- **Draft review** — AI- and human-written drafts get a first-class
  queue: open one, send it as-is, or edit-then-send.
- **Attachment intelligence** — files land on your disk, get indexed by
  content (search `file:contract`), and duplicates get deduped.
- **Honest read receipts** — opt-in `Return-Receipt-To` headers, inbound
  MDN detection marks your sent mail as opened. No tracking pixels.
- **A local HTTP API + MCP server** — `/api/v1/*` endpoints
  ([docs/API.md](docs/API.md)) and an MCP server ([docs/MCP.md](docs/MCP.md))
  so Claude Desktop, Cursor, or your own agents can search, ask, triage,
  and send — all on your machine.
- **A companion browser extension** — unread badge + desktop
  notifications even when the tab is closed, mailto: links that open
  our composer, right-click "email this page", and ask/search from any
  selection. Load `apps/extension` unpacked — see
  [docs/EXTENSION.md](docs/EXTENSION.md).
- **Analytics + an inbox energy budget** — volume, top senders, health
  score, and a "this inbox costs you ~40 min today — here's the 12-min
  subset" card.
- **100% local** — Postgres on your machine, bodies on your disk,
  secrets encrypted with a key you hold.

## What it needs (system requirements)

- **Node.js 20+** and npm
- **PostgreSQL 14+** running locally (14 is the floor; 17 is what we test)
- **Ollama** (optional but recommended) for the local AI — or an
  OpenAI/Anthropic API key
- macOS, Linux, or Windows — anywhere the above run

## Quick start — five minutes to a working inbox

> **New to this?** See **[docs/INSTALL.md](docs/INSTALL.md)** — plain
> step-by-step instructions for macOS, Windows, and Linux, no developer
> experience needed.

**One command** (all platforms — provisions Postgres via Docker or your
package manager, creates the DB, migrates, seeds a demo inbox, pulls
models):

```bash
git clone https://github.com/peopleofproduct/dzong-mail.git
cd dzong-mail
npm run setup        # add --no-ai to skip Ollama
npm run dev
```

Or step by step:

```bash
# 1. Get the code
git clone https://github.com/peopleofproduct/dzong-mail.git
cd dzong-mail
npm install

# 2. Start PostgreSQL and create the database
#    macOS (Homebrew):
brew install postgresql@17 && brew services start postgresql@17
createdb dzong_mail
#    Linux: install postgresql via your package manager, then `createdb dzong_mail`

# 3. Point the app at your database
cp packages/database/.env.example packages/database/.env
#    Edit the file if your Postgres user/password differ.
#    Default assumes postgresql://postgres:postgres@localhost:5432/dzong_mail

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
machine), choose a model, enable. Note: Anthropic can't index your mail,
so we quietly pair it with your local Ollama for search and answers —
if Ollama isn't running, search falls back to keyword matching and says
so.

## Connect a real account

From **Settings → Accounts** (or the connect cards on the home page):

- **IMAP/SMTP (works with almost everyone)** — enter host, port, and an
  app-specific password. Gmail: turn on 2FA then create an app password.
  Fastmail/Zoho/iCloud: app passwords in their security settings. Proton:
  run Proton Mail Bridge locally and point us at it.
- **Gmail OAuth** — create a Google Cloud OAuth client (see
  `docs/SETUP.md` for the 5-minute walkthrough), paste your client
  ID/secret into the connect form, authorize. Same for **Microsoft**.
- **Demo account** — the seeded `demo@dzong.local` mock provider emits
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
apps/extension      Manifest V3 browser companion — badge, notifications, mailto
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
- `DZONG_SECRET_KEY` — encrypts stored credentials; when unset a random
  machine-local key is generated and persisted at
  `~/.dzong-mail/secret.key` (mode 0600). Set a real one — `openssl rand
  -hex 32` in `apps/web/.env.local` — to share the key across machines.
  `UNWALLED_SECRET_KEY`/`UNWALLED_DATA_DIR` from pre-rename installs are
  still honored.
- `DZONG_DATA_DIR` — where attachments, avatars, and the generated key
  live (default `~/.dzong-mail`; legacy `~/.unwalled-mail` is detected)
- Ollama base URL, model, temperature — all configurable in Settings

## Roadmap — where we're headed

Working today: everything above, plus the `npm run worker` background
loop (scheduled sends, snooze returns, periodic sync + AI classify +
indexing), **IMAP IDLE watchers for near-instant new-mail delivery**
for IMAP accounts while the worker runs, and a local HTTP API for
scripts and agents.
Coming next (roughly in order): real-mailbox hardening on more
providers, meeting briefs built from the sender dossiers we already
keep, assistant actions you confirm before they run, a companion
browser extension, and a mobile story via an optional encrypted relay
(the one thing local-first can't do alone — it'll be self-hostable
too).

## Contributing

Found a bug, want a feature, fixed something? Issues and PRs are the
product roadmap. See `docs/SETUP.md` for environment details and
`AGENTS.md` for the workspace map.

## License

MIT — do what you want with it. That's the point.
