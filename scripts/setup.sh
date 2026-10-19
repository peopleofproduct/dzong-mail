#!/usr/bin/env bash
# Unwalled Mail — one-command local setup.
# Checks prerequisites (installing what's missing on macOS/Debian),
# creates the database, applies migrations, seeds a demo inbox,
# and pulls the local AI models.
set -euo pipefail

cd "$(dirname "$0")/.."

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

WITH_AI=1
for arg in "$@"; do
  case "$arg" in
    --no-ai) WITH_AI=0 ;;
    *) die "unknown flag: $arg (supported: --no-ai)" ;;
  esac
done

# ─── 1. Node.js ───────────────────────────────────────────────────────────────
say "Checking Node.js…"
have node || die "Node.js 20+ required — install via https://nodejs.org or your package manager"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $NODE_MAJOR found, need >= 20"
echo "   node $(node --version) ✓"

# ─── 2. PostgreSQL ────────────────────────────────────────────────────────────
say "Checking PostgreSQL…"
if ! have psql && ! have pg_isready; then
  if have brew; then
    say "Installing postgresql@17 via Homebrew…"
    brew install postgresql@17
    brew services start postgresql@17
    export PATH="/opt/homebrew/opt/postgresql@17/bin:/usr/local/opt/postgresql@17/bin:$PATH"
  elif have apt-get; then
    say "Installing postgresql via apt…"
    sudo apt-get update -qq && sudo apt-get install -y postgresql postgresql-contrib
    sudo systemctl enable --now postgresql
  else
    die "PostgreSQL not found. Install it (https://postgresql.org/download) or use Docker:
       docker run -d --name unwalled-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=unwalled_mail -p 5432:5432 postgres:17"
  fi
fi

# Wait for the server to accept connections.
for i in $(seq 1 15); do
  if psql -h localhost -d postgres -c 'select 1' >/dev/null 2>&1 \
  || psql -d postgres -c 'select 1' >/dev/null 2>&1; then
    break
  fi
  [ "$i" -eq 15 ] && die "PostgreSQL is installed but not reachable on localhost:5432 — start it and re-run"
  sleep 1
done

# Create the database + a postgres superuser for the default URL if missing.
psql -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='unwalled_mail'" \
  | grep -q 1 || psql -d postgres -c "CREATE DATABASE unwalled_mail" >/dev/null
psql -d postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='postgres'" \
  | grep -q 1 || psql -d postgres -c "CREATE ROLE postgres LOGIN SUPERUSER PASSWORD 'postgres'" >/dev/null
echo "   postgres + unwalled_mail ✓"

# Optional: pgvector accelerates semantic search at large mailbox sizes.
# Everything works without it (in-process cosine fallback); failures here
# are informational, never fatal.
if have brew && ! brew list pgvector >/dev/null 2>&1; then
  brew install pgvector >/dev/null 2>&1 \
    && echo "   pgvector installed" \
    || say "   pgvector not installed - semantic search uses the JS fallback (fine)"
elif have apt-get && ! dpkg -l | grep -q postgresql-.*-pgvector; then
  sudo apt-get install -y "$(apt-cache search '^postgresql-[0-9]+-pgvector$' | head -1 | cut -d' ' -f1)" >/dev/null 2>&1 \
    || true
fi
psql -d unwalled_mail -c "CREATE EXTENSION IF NOT EXISTS vector" >/dev/null 2>&1 \
  && echo "   pgvector extension enabled (fast semantic index)" \
  || true

# ─── 3. Environment files ─────────────────────────────────────────────────────
say "Configuring environment…"
if [ ! -f packages/database/.env ]; then
  cp packages/database/.env.example packages/database/.env
  echo "   wrote packages/database/.env"
fi
if [ ! -f apps/web/.env.local ]; then
  echo "UNWALLED_SECRET_KEY=$(openssl rand -hex 32)" > apps/web/.env.local
  echo "   generated UNWALLED_SECRET_KEY in apps/web/.env.local"
fi

# ─── 4. Dependencies, migrate, seed ──────────────────────────────────────────
say "Installing dependencies…"
npm install --no-audit --no-fund

say "Applying database migrations…"
npm run db:migrate

say "Seeding demo inbox…"
npm run db:seed

# ─── 5. Ollama (optional local AI) ────────────────────────────────────────────
if [ "$WITH_AI" -eq 1 ]; then
  say "Checking Ollama (local AI)…"
  if ! have ollama; then
    if have brew; then
      say "Installing ollama via Homebrew…"
      brew install ollama
      brew services start ollama
    elif have curl; then
      say "Installing ollama via install script…"
      curl -fsSL https://ollama.com/install.sh | sh
    else
      warn "Ollama not installed — AI features will be off. See https://ollama.com"
    fi
  fi
  if have ollama; then
    curl -s --max-time 3 http://localhost:11434/api/tags >/dev/null \
      || (ollama serve >/dev/null 2>&1 & sleep 3)
    for model in llama3.2:3b nomic-embed-text; do
      if ! ollama list | grep -q "$model"; then
        say "Pulling $model (one-time download)…"
        ollama pull "$model" >/dev/null
      fi
      echo "   $model ✓"
    done
  fi
fi

cat <<'DONE'

  ✅  Unwalled Mail is set up.

    npm run dev       → open http://localhost:3000
    npm run worker    → (second terminal) scheduled sends + auto-sync

  Next: connect a real account in Settings → Accounts, and enable AI in
  Settings → AI engine. See docs/SETUP.md for OAuth app walkthroughs.

DONE
