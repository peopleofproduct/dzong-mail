#!/usr/bin/env tsx
// Dzong Mail — one-command local setup, cross-platform (macOS/Linux/Windows).
// Checks prerequisites (auto-installing where safe), creates the database,
// applies migrations, seeds a demo inbox, and pulls the local AI models.
//   npm run setup             full setup incl. Ollama models
//   npm run setup -- --no-ai  skip Ollama entirely
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

const ROOT = join(dirname(process.argv[1]), "..");
const IS_WIN = process.platform === "win32";

const say = (m: string) => console.log(`\x1b[1;34m==>\x1b[0m ${m}`);
const ok = (m: string) => console.log(`   ${m} ✓`);
const warn = (m: string) => console.log(`\x1b[1;33m!!\x1b[0m ${m}`);
const die = (m: string): never => {
  console.error(`\x1b[1;31m✗ ${m}\x1b[0m`);
  process.exit(1);
};

// Cross-platform command check — spawnSync resolves PATHEXT on Windows.
const have = (cmd: string) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;

const run = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: IS_WIN });

const runQuiet = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", shell: IS_WIN });

// Probe wherever DATABASE_URL points (default localhost:5432) — an
// existing .env can name another host, and we don't want to docker-provision
// in front of a remote database.
const pgTarget = () => {
  try {
    const raw = readFileSync(join(ROOT, "packages/database/.env"), "utf8");
    const m = raw.match(/postgresql:\/\/[^@/]+@([a-zA-Z0-9._-]+):(\d+)/);
    if (m) return { host: m[1], port: Number(m[2]) };
  } catch {}
  return { host: "localhost", port: 5432 };
};

const pgReachable = () =>
  new Promise<boolean>((resolve) => {
    const { host, port } = pgTarget();
    const s = connect({ host, port });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
    s.setTimeout(2000, () => (s.destroy(), resolve(false)));
  });

const ollamaUp = async () => {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 3000);
    const r = await fetch("http://localhost:11434/api/tags", {
      signal: c.signal,
    });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
};

// psql access comes from one of three channels: the psql binary on PATH,
// a running dzong-pg docker container, or psql inside any postgres container.
type Psql = (sql: string, db?: string) => string | null;

const dockerPsql =
  (name: string): Psql =>
  (sql, db = "postgres") => {
    const r = runQuiet("docker", ["exec", name, "psql", "-U", "postgres", "-d", db, "-tc", sql]);
    return r.status === 0 ? r.stdout : null;
  };

// docker CLI exists even when the daemon is down — check separately so we
// can say "start Docker Desktop" instead of dying on a failed run.
const dockerRunning = () => have("docker") && runQuiet("docker", ["info"]).status === 0;

async function main() {
  const WITH_AI = !process.argv.includes("--no-ai");

  // ─── 1. Node.js ─────────────────────────────────────────────────────────
  say("Checking Node.js…");
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 20) die(`Node ${nodeMajor} found, need >= 20`);
  ok(`node ${process.version}`);

  // ─── 2. PostgreSQL ──────────────────────────────────────────────────────
  say("Checking PostgreSQL…");

  const { host: pgHost, port: pgPort } = pgTarget();
  if (!(await pgReachable())) {
    if (pgHost !== "localhost" && pgHost !== "127.0.0.1")
      die(
        `DATABASE_URL points at ${pgHost}:${pgPort}, which isn't reachable.\n` +
          "  Check the host/credentials in packages/database/.env, or remove\n" +
          "  it to let setup provision a local Postgres.",
      );
    // Nothing listening — provision via whatever's available.
    if (have("docker") && !dockerRunning())
      die("Docker is installed but not running — start Docker Desktop and re-run npm run setup");
    if (dockerRunning()) {
      say("Starting Postgres via Docker (pgvector image)…");
      const r = run("docker", [
        "run",
        "-d",
        "--name",
        "dzong-pg",
        "-e",
        "POSTGRES_PASSWORD=postgres",
        "-e",
        "POSTGRES_DB=dzong_mail",
        "-p",
        "5432:5432",
        "pgvector/pgvector:pg17",
      ]);
      if (r.status !== 0) die("docker run failed — see docs/SETUP.md §1");
    } else if (have("brew")) {
      say("Installing postgresql@17 via Homebrew…");
      run("brew", ["install", "postgresql@17"]);
      run("brew", ["services", "start", "postgresql@17"]);
      const prefix = existsSync("/opt/homebrew/opt/postgresql@17/bin")
        ? "/opt/homebrew/opt/postgresql@17/bin"
        : "/usr/local/opt/postgresql@17/bin";
      process.env.PATH = `${prefix}:${process.env.PATH}`;
    } else if (have("apt-get")) {
      say("Installing postgresql via apt…");
      run("sudo", ["apt-get", "update", "-qq"]);
      run("sudo", ["apt-get", "install", "-y", "postgresql", "postgresql-contrib"]);
      run("sudo", ["systemctl", "enable", "--now", "postgresql"]);
    }
    for (let i = 0; i < 15 && !(await pgReachable()); i++)
      await new Promise((r) => setTimeout(r, 1000));
    if (!(await pgReachable()))
      die(
        `PostgreSQL not reachable on ${pgHost}:${pgPort}. Install it:\n` +
          "  docker run -d --name dzong-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dzong_mail -p 5432:5432 pgvector/pgvector:pg17\n" +
          (IS_WIN ? "  or the EDB installer: https://postgresql.org/download/windows\n" : "") +
          "  then re-run npm run setup",
      );
  }
  ok(`postgres reachable on ${pgHost}:${pgPort}`);

  // Resolve a psql channel for DB/role/extension setup.
  let psql: Psql | null = null;
  if (have("psql")) {
    psql = (sql, db = "postgres") => {
      const r = runQuiet("psql", ["-h", "localhost", "-d", db, "-tc", sql]);
      if (r.status !== 0)
        // Local-trust installs (Homebrew) connect without a host.
        return runQuiet("psql", ["-d", db, "-tc", sql]).stdout ?? null;
      return r.stdout;
    };
  } else if (dockerRunning()) {
    const names = runQuiet("docker", ["ps", "--format", "{{.Names}}"]).stdout ?? "";
    const name =
      names.split("\n").find((n) => n.trim() === "dzong-pg") ??
      names.split("\n").find((n) => n.includes("postgres"));
    if (name) psql = dockerPsql(name.trim());
  }

  if (psql) {
    const dbExists = psql("SELECT 1 FROM pg_database WHERE datname='dzong_mail'")?.includes("1");
    if (!dbExists) {
      psql("CREATE DATABASE dzong_mail");
      ok("created database dzong_mail");
    }
    const roleExists = psql("SELECT 1 FROM pg_roles WHERE rolname='postgres'")?.includes("1");
    if (!roleExists) {
      psql("CREATE ROLE postgres LOGIN SUPERUSER PASSWORD 'postgres'");
      ok("created postgres role");
    }
    const ext = psql("CREATE EXTENSION IF NOT EXISTS vector", "dzong_mail");
    if (ext !== null) ok("pgvector extension enabled (fast semantic index)");
    else warn("pgvector not available — semantic search uses the JS fallback (fine)");
  } else {
    warn(
      "no psql or docker found — can't verify the database exists.\n" +
        "   If migrations fail below, create it: CREATE DATABASE dzong_mail;\n" +
        "   (docs/SETUP.md §1 has per-OS steps)",
    );
  }

  // ─── 3. Environment files ───────────────────────────────────────────────
  say("Configuring environment…");
  const dbEnv = join(ROOT, "packages/database/.env");
  if (!existsSync(dbEnv)) {
    copyFileSync(join(ROOT, "packages/database/.env.example"), dbEnv);
    ok("wrote packages/database/.env");
  }
  const webEnv = join(ROOT, "apps/web/.env.local");
  if (!existsSync(webEnv)) {
    writeFileSync(webEnv, `DZONG_SECRET_KEY=${randomBytes(32).toString("hex")}\n`);
    ok("generated DZONG_SECRET_KEY in apps/web/.env.local");
  }

  // ─── 4. Dependencies, migrate, seed ─────────────────────────────────────
  const npm = IS_WIN ? "npm.cmd" : "npm";
  say("Installing dependencies…");
  if (run(npm, ["install", "--no-audit", "--no-fund"]).status !== 0) die("npm install failed");

  say("Applying database migrations…");
  if (run(npm, ["run", "db:migrate"]).status !== 0)
    die("db:migrate failed — check DATABASE_URL in packages/database/.env");

  say("Seeding demo inbox…");
  run(npm, ["run", "db:seed"]);

  // ─── 5. Ollama (optional local AI) ──────────────────────────────────────
  if (WITH_AI) {
    say("Checking Ollama (local AI)…");
    if (!have("ollama") && !(await ollamaUp())) {
      if (have("brew")) {
        say("Installing ollama via Homebrew…");
        run("brew", ["install", "ollama"]);
        run("brew", ["services", "start", "ollama"]);
      } else if (!IS_WIN && have("curl")) {
        say("Installing ollama via install script…");
        run("sh", ["-c", "curl -fsSL https://ollama.com/install.sh | sh"]);
      } else {
        warn(
          "Ollama not installed — AI features will be off.\n" +
            (IS_WIN
              ? "   Windows: install from https://ollama.com/download/windows (runs as a tray app)\n"
              : "   Install from https://ollama.com\n") +
            "   then re-run npm run setup",
        );
      }
    }
    if (have("ollama") || (await ollamaUp())) {
      if (!(await ollamaUp()) && have("ollama") && !IS_WIN) {
        // Server not running but CLI exists — start it. On Windows the
        // tray app owns the server; have(ollama) implies it's up.
        spawn("ollama", ["serve"], {
          detached: true,
          stdio: "ignore",
        }).unref();
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (have("ollama")) {
        const list = runQuiet("ollama", ["list"]).stdout ?? "";
        for (const model of ["llama3.2:3b", "nomic-embed-text"]) {
          if (!list.includes(model)) {
            say(`Pulling ${model} (one-time download)…`);
            run("ollama", ["pull", model]);
          }
          ok(model);
        }
      } else {
        ok("ollama server up — pull models via `ollama pull llama3.2:3b`");
      }
    }
  }

  console.log(`
  ✅  Dzong Mail is set up.

    npm run dev       → open http://localhost:3000
    npm run worker    → (second terminal) scheduled sends + auto-sync

  Next: connect a real account in Settings → Accounts, and enable AI in
  Settings → AI engine. See docs/SETUP.md for OAuth app walkthroughs.
`);
}

main().catch((err) => die(String(err)));
