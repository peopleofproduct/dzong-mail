# Install Dzong Mail — step-by-step for everyone

No developer experience needed. Follow the section for your computer —
every step is copy-paste. Total time: about **15 minutes**, mostly
downloads.

**What you'll end up with:** your own email app running at
`http://localhost:3000` — your mail stays on your machine, and the AI
runs there too.

**What the installer needs:** three free things —
- **Node.js** — the engine that runs the app
- **PostgreSQL** — a small database on your machine that stores your
  mail index (nothing is sent anywhere)
- **Ollama** *(optional)* — free local AI that drafts and sorts mail
  offline

> Good news: `npm run setup` checks and installs most of this for you.
> You mainly need to install Node yourself — the rest is one command.

---

## 🍎 macOS

### Step 1 — Install Homebrew (the Mac app store for tools)
Open **Terminal** (Applications → Utilities → Terminal) and paste:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the prompts (it may ask for your Mac password). When it finishes,
run the two commands it prints at the end to add `brew` to your PATH.

### Step 2 — Install the basics

```bash
brew install node git
```

### Step 3 — Get Dzong Mail

```bash
git clone https://github.com/peopleofproduct/dzong-mail.git
cd dzong-mail
```

### Step 4 — Run the setup

```bash
npm run setup
```

This installs PostgreSQL, creates your database, builds a demo inbox,
and downloads the local AI models (a few GB — grab coffee). To skip the
AI download, use `npm run setup -- --no-ai` instead.

### Step 5 — Start it

```bash
npm run dev
```

Open **http://localhost:3000** — you're in. 🎉

> Keep this terminal window open while you use the app. Closing it stops
> the app (your data stays safe — just run `npm run dev` again next time).

---

## 🪟 Windows

### Step 1 — Install Node.js
Go to **https://nodejs.org** → click the big **LTS** button → run the
downloaded installer → Next, Next, Finish.

### Step 2 — Install Git
Go to **https://git-scm.com/download/win** → run the installer → accept
all defaults (Next through everything).

### Step 3 — Install Docker Desktop (this gives you the database)
Go to **https://docker.com/products/docker-desktop** → download for
Windows → install → **open Docker Desktop** once and wait for it to say
it's running (it may ask to enable a Windows feature — say yes and
restart if asked).

*Prefer no Docker?* Install PostgreSQL from
https://postgresql.org/download/windows instead — set the password to
`postgres` during install, then create a database named `dzong_mail`
using pgAdmin (comes with it). Skip to Step 4 after that.

### Step 4 — Get and set up Dzong Mail
Open **PowerShell** (Start → type "PowerShell") and paste:

```powershell
git clone https://github.com/peopleofproduct/dzong-mail.git
cd dzong-mail
npm run setup
```

The setup starts your database container, creates everything, and seeds
a demo inbox. (Add `-- --no-ai` to skip the AI part.)

### Step 5 — Optional: free local AI
Install **Ollama** from https://ollama.com/download/windows — it sits in
your system tray. Then in PowerShell:

```powershell
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

### Step 6 — Start it

```powershell
npm run dev
```

Open **http://localhost:3000** — you're in. 🎉

---

## 🐧 Linux (Ubuntu/Debian)

### Step 1 — Install the basics

```bash
sudo apt update
sudo apt install -y nodejs npm git curl
```

*If your distro's Node is older than 20* (`node --version` to check),
get the current one:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### Step 2 — Get Dzong Mail

```bash
git clone https://github.com/peopleofproduct/dzong-mail.git
cd dzong-mail
```

### Step 3 — Run the setup

```bash
npm run setup
```

It installs PostgreSQL (or uses Docker if you prefer), creates the
database, seeds a demo inbox, and pulls the local AI models. Add
`-- --no-ai` to skip Ollama.

### Step 4 — Start it

```bash
npm run dev
```

Open **http://localhost:3000** — you're in. 🎉

---

## After install — make it yours

1. **Explore the demo inbox** — the seed loads sample mail so you can
   click around safely.
2. **Connect a real account:** Settings → Accounts.
   - Gmail: enter your address + an **app password** (Google Account →
     Security → App passwords — the card in Settings walks you through it)
   - Outlook/iCloud/Fastmail/any IMAP: pick your provider, fields autofill
3. **Turn on the AI:** Settings → AI engine → pick Ollama (local, free,
   offline) or paste an Anthropic/OpenAI key.
4. **Optional — the background worker** keeps mail syncing and scheduled
   sends running while you're in other apps. In a second terminal:

   ```bash
   npm run worker
   ```

5. **Optional — browser extension + installable app:** load
   `apps/extension` in `chrome://extensions` (Developer mode → Load
   unpacked) for desktop notifications, or use "Install app" in your
   browser to put Dzong Mail on your dock/taskbar.

## Updating later

```bash
cd dzong-mail
git pull
npm install
npm run db:migrate
```

## Removing it

```bash
# Stop the app (Ctrl+C in its terminal), then:
cd .. && rm -rf dzong-mail           # the app
psql -c "DROP DATABASE dzong_mail"   # the mail index
rm -rf ~/.dzong-mail                 # attachments + cached files
```

(Docker users: `docker rm -f dzong-pg` removes the database container.)

## Something went wrong?

| Symptom | Fix |
|---|---|
| `command not found: npm` | Node isn't installed or the terminal needs reopening after install |
| `PostgreSQL not reachable` | Docker Desktop isn't running — open it and retry |
| `port 3000 already in use` | Something else is on 3000 — stop it, or run `PORT=3001 npm run dev` |
| Setup dies on `npm install` | Check your internet/VPN, then re-run `npm run setup` — it's safe to re-run |
| AI features say "provider offline" | Ollama isn't running — open the app/tray icon, or check Settings → AI engine |

Still stuck? Open an issue at
github.com/peopleofproduct/dzong-mail/issues with the exact error text.

*For OAuth app setup, BYOK keys, and power-user configuration, see
[docs/SETUP.md](SETUP.md).*
