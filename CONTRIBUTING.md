# Contributing to Dzong Mail

Thanks for being here. Issues and PRs are the product roadmap — a
well-filed bug report is as valuable as a patch.

## Ground rules

- **Local-first is the contract.** Never add a code path that sends
  user mail, credentials, or derived data to anywhere other than the
  user's configured mail provider or their chosen AI endpoint. If a
  feature can't work locally, that's a design conversation, not a PR.
- **Free means free.** No feature gates, no tiers, no telemetry.
- **Real data stays out.** Never commit credentials, real email
  content, or `.env` files. Test against the Mock provider and the
  seeded demo inbox, not a real mailbox.

## Getting set up

See [`docs/SETUP.md`](docs/SETUP.md) for the full walkthrough. The
short version:

```bash
npm install
cp packages/database/.env.example packages/database/.env   # point at your Postgres
npm run db:migrate && npm run db:seed                       # schema + demo inbox
npm run dev                                                 # web on :3000
```

The demo inbox (`demo@dzong.local`, MOCK provider) gives you a fully
tagged, representative dataset with zero real mail — use it for
reproductions and screenshots.

## Workspace map

```
apps/web             Next.js 16 dashboard (App Router, TypeScript, Tailwind 4)
apps/extension       Manifest V3 browser companion
packages/database    Prisma schema/client — the shared `prisma` singleton
packages/sync-engine Provider strategies (IMAP, Gmail, Graph, Mock), send,
                     automation rules, classification, unsubscribe
packages/ai-engine   Ollama/OpenAI/Anthropic abstraction
packages/mcp-server  MCP interface
scripts/             seed-demo.ts and dev utilities
```

`AGENTS.md` has the deeper architecture notes. `apps/web/AGENTS.md`
covers the Next.js 16 specifics — **that version has breaking changes
vs. earlier Next** (async request APIs, `connection()` before dynamic
DB reads inside Suspense). Version-matched docs live in
`node_modules/next/dist/docs/` — consult them before editing app code.

## Conventions

- **Strict TypeScript** — `npm run typecheck` must stay clean
- **Lint** — `npm run lint`; no new errors or warnings
- **Format** — `npm run format` (Prettier, Tailwind class sorting)
- **UI** — keep it accessible: labels on controls, keyboard paths,
  readable contrast. We aim for world-class UX: instant feedback,
  skeletons while loading, no layout jank
- **Code style** — compact and idiomatic; match the surrounding file's
  patterns, don't introduce new dependencies without a reason

## Before you open a PR

1. `npm run typecheck && npm run lint && npm run build` — all clean
2. Manually verify the flow you touched (demo inbox is fine)
3. Keep the diff focused — one concern per PR
4. Describe *why* in the PR body, not just what
5. For user-facing changes, include a screenshot or short clip

## Good first contributions

- Bug reports with reproductions on the demo inbox
- Provider coverage — unusual IMAP servers, edge cases in sync
- Docs fixes, setup friction notes
- Accessibility and keyboard-map gaps
- Labeling/classification quality notes (what the AI got wrong and why)

Questions? Open an issue with the `question` label — maintainers reply.
