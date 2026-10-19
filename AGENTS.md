# Unwalled Mail

Open-source, local-first AI email platform. All data lives on the user's own
machine — PostgreSQL for metadata, local disk for message bodies, Ollama or
BYOK cloud keys for inference.

## Workspace layout

npm workspaces orchestrated by Turborepo:

- `apps/web` — Next.js 16 dashboard (App Router, TypeScript, Tailwind CSS 4,
  Turbopack). Imports workspace packages via `@unwalled/*`.
- `packages/database` — `@unwalled/database`. Prisma schema, generated client,
  and shared `prisma` singleton (import `{ prisma }` from `@unwalled/database`).
- `packages/ai-engine` — `@unwalled/ai-engine`. Provider abstraction
  (`AIProvider` interface) routing completions/embeddings/classification to
  Ollama (local, default `http://localhost:11434`) or OpenAI/Anthropic stubs.
- `packages/sync-engine` — `@unwalled/sync-engine`. `MailSyncProvider`
  strategies (IMAP via imapflow/mailparser, Gmail history API, Graph delta,
  deterministic Mock), OAuth helpers for Google/Microsoft BYOK flows,
  AES-256-GCM secret encryption, and the `syncAccount`/`syncAllAccounts`
  orchestrator that upserts `Message` rows and advances each account's
  `syncToken`.

## Commands

Run from the repo root:

- `npm run dev` — start all dev servers (web on :3000)
- `npm run build` / `npm run lint` / `npm run typecheck` — turbo pipelines
- `npm run format` / `npm run format:check` — Prettier (Tailwind class sorting enabled)
- `npm run db:generate` — regenerate Prisma client
- `npm run db:migrate` — `prisma migrate dev` (requires local Postgres)
- `npm run db:push` — push schema without migration history
- `npm run db:seed` — create demo user + MOCK account and sync a batch of
  generated messages

Database connection: `DATABASE_URL` in `packages/database/.env`
(default `postgresql://postgres:postgres@localhost:5432/unwalled_mail`).
Local Postgres is installed via Homebrew (`postgresql@17`, `brew services
start postgresql@17`) with a `postgres` superuser for the default URL.

Secrets at rest are AES-256-GCM encrypted with a key derived from
`UNWALLED_SECRET_KEY`; a built-in dev key is used when unset (a warning is
logged). Set it before storing real credentials.

OAuth flows: connect forms store BYOK client credentials, then server actions
redirect to the provider; callbacks live at
`apps/web/src/app/api/oauth/{google,microsoft}/callback/route.ts` and persist
encrypted tokens on the `EmailAccount` row.

## Conventions

- Strict TypeScript everywhere; `tsc --noEmit` must stay clean.
- ESLint flat configs per package; Prettier handles formatting
  (`eslint-config-prettier` last in `apps/web`).
- No real external API handshakes yet — `ai-engine` cloud providers are
  scaffolds; only the Ollama provider is functional (still local).
- Secrets/credentials are stored locally and must never leave the machine
  or be committed. `.env` files are gitignored.

## Next.js 16 note

`apps/web` runs Next 16 with breaking changes vs. earlier versions (async
request APIs, Turbopack default, `cacheComponents`). Version-matched docs live
in `node_modules/next/dist/docs/` — consult them before editing app code.
