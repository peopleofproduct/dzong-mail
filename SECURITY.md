# Security Policy

Dzong Mail is local-first by design: your mail, credentials, and AI
activity live on your machine. We take the security of that boundary
seriously — especially stored OAuth tokens, IMAP passwords, and BYOK
API keys, which are encrypted at rest with AES-256-GCM.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security reports.

Email security reports to **security@peopleofproduct.com** (or use
GitHub's private vulnerability reporting on this repository). Include:

- A description of the issue and affected component
- Steps to reproduce, or a proof of concept
- Any relevant version/commit information

We will acknowledge receipt within 72 hours and aim to share an
assessment within 7 days. We ask that you give us reasonable time to
ship a fix before any public disclosure — we'll coordinate the timeline
with you.

## Scope — what we consider in-scope

- Any path that causes **mail content, credentials, or derived data to
  leave the user's machine** outside of the explicitly configured
  provider endpoints (mail sync, and the user's chosen AI endpoint)
- Weaknesses in credential storage (encryption at rest, key handling,
  `DZONG_SECRET_KEY` derivation)
- The OAuth callback/refresh flows and token lifecycle
- Injection paths through synced mail content (rendered HTML, headers,
  automation rules, AI prompt construction)
- The local HTTP API and MCP server surfaces

## Out of scope

- Issues requiring physical access to an already-unlocked machine —
  our threat model is a lost/seized device at rest, not a live
  compromised host
- Vulnerabilities in third-party dependencies without a demonstrated
  exploit path through Dzong Mail (report those upstream)
- Social engineering

## Known design notes (declared, not bugs)

- When `DZONG_SECRET_KEY` is unset, a development fallback key is used
  and a warning is logged — do not store real credentials with the
  fallback
- BYOK AI mode sends message content to the provider you configured —
  that egress is opt-in and visible in Settings
- The app serves a local web UI; binding it beyond localhost is your
  deployment decision, not the default

## Supported versions

Security fixes ship on `main` and the latest tagged release. We
recommend tracking the latest release; older tags receive fixes on a
best-effort basis.
