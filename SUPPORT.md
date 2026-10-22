# Support

## Getting help

- **Setup and install issues** — start with [`docs/SETUP.md`](docs/SETUP.md)
  and [`docs/INSTALL.md`](docs/INSTALL.md); most problems are Postgres
  connection strings or a missing Ollama model
- **AI features not working** — check Settings → AI. Features degrade
  gracefully when no provider is reachable; a running `ollama serve`
  with a pulled model (e.g. `ollama pull llama3.2:3b`) is the default
- **Bugs** — open a [GitHub issue](../../issues/new?template=bug_report.md).
  Reproductions on the seeded demo inbox (`demo@dzong.local`) get fixed
  fastest
- **Feature requests** — open an issue with the feature template; the
  roadmap is community-shaped
- **Questions** — GitHub issue with the `question` label, or
  [Discussions](../../discussions) if enabled

## What to include in a bug report

The template asks for it, but the short version: what you did, what you
expected, what happened, your OS + Node version, and whether it
reproduces on the demo inbox. Screenshots help enormously for UI bugs.

## Security issues

Do **not** file public issues for vulnerabilities — see
[SECURITY.md](SECURITY.md).

## Response expectations

This is a small open-source team. We aim to triage new issues within a
few days. If it's blocking you, say so — we prioritize by impact.
