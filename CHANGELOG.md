# Changelog

All notable changes to Dzong Mail are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] — Launch

The first public release — an open-source, local-first AI email
assistant that runs entirely on your machine.

### Added

- **Three-pane mail client** — inbox, threads, rich-text composer with
  snippets, send/reply/forward, drafts, snooze, send-later, undo-send,
  archive, trash, keyboard map, and compact/comfortable list density
- **Providers** — Gmail, Microsoft Graph, generic IMAP/SMTP, and a
  deterministic Mock provider for development and demos
- **Local AI** — triage labels, reply drafts (3 variants), thread
  summaries, digests, and semantic "ask my inbox" search via Ollama
  by default; optional BYOK for OpenAI/Anthropic
- **Assistant layer** — follow-up/reply-debt tracking, needs-reply
  queue, natural-language automation rules, smart notifications
- **Unsubscribe manager** — one-click unsubscribe via List-Unsubscribe
  where supported, and local Mute rules where it isn't
- **Inbox analytics** — arrival heatmap, category mix, read rates,
  inbox health — all computed locally
- **Per-recipient voice** — drafts match the tone you actually use with
  each person, inferred from your shared history
- **Audit trail** — every automated action logged with a written "why"
  and reversible
- **Security** — AES-256-GCM encrypted secrets at rest; OAuth
  connect/refresh flows for Gmail and Microsoft
- **Interfaces** — local HTTP API, MCP server, and browser-extension
  companion
- **Imports/exports** — one-click mbox export per account

[0.1.0]: https://github.com/peopleofproduct/dzong-mail/releases/tag/v0.1.0
