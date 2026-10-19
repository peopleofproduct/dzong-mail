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

## Commands

Run from the repo root:

- `npm run dev` — start all dev servers (web on :3000)
- `npm run build` / `npm run lint` / `npm run typecheck` — turbo pipelines
- `npm run format` / `npm run format:check` — Prettier (Tailwind class sorting enabled)
- `npm run db:generate` — regenerate Prisma client
- `npm run db:migrate` — `prisma migrate dev` (requires local Postgres)
- `npm run db:push` — push schema without migration history

Database connection: `DATABASE_URL` in `packages/database/.env`
(default `postgresql://postgres:postgres@localhost:5432/unwalled_mail`).

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
