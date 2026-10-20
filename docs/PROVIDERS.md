# Provider compatibility

Dzong Mail speaks three protocols: Gmail API (OAuth), Microsoft Graph
(OAuth) and plain IMAP/SMTP. Anything that exposes one of those works - the
list below is what we preset and test, not a hard boundary.

## Verified paths

| Provider | Path | Notes |
|---|---|---|
| Gmail | Gmail API (OAuth) **or** IMAP/SMTP | OAuth needs your own Google Cloud client ID/secret (see SETUP.md). IMAP needs an app password when 2FA is on. |
| Google Workspace | Same as Gmail | Custom domains work identically. |
| Outlook.com / Microsoft 365 | Graph API (OAuth) **or** IMAP/SMTP | OAuth needs an Entra app registration. IMAP needs SMTP AUTH enabled in the tenant. |
| iCloud Mail | IMAP/SMTP preset | Requires an app-specific password (appleid.apple.com). |
| Fastmail | IMAP/SMTP preset | App password from Settings > Privacy & Security. Full push via IMAP IDLE. |
| Yahoo Mail | IMAP/SMTP preset | App password required. |
| Zoho Mail | IMAP/SMTP preset | Enable IMAP in Mail Settings first. |
| Proton Mail | IMAP/SMTP preset | Works through Proton Mail Bridge running locally - the preset points at `127.0.0.1`. End-to-end encryption stays intact because Bridge decrypts locally anyway. |
| Self-hosted (Dovecot, Mailcow, Stalwart, etc.) | Custom IMAP/SMTP | Any standards-compliant server; supports SSL/TLS, STARTTLS and plaintext for LAN setups. |

## The verification harness

`npm run verify:providers` live-checks every connected account without
reading mail:

- **IMAP/SMTP** - IMAP login + INBOX lock, then an SMTP `verify()` handshake
- **Gmail API** - token refresh if needed, then `users/me/profile`
- **Graph** - token refresh if needed, then `/me`

The same checks power the **Verify** button next to each account in Settings.
Exit code is non-zero on any failure, so CI or a pre-release checklist can
gate on it.

## Known limits

- **OAuth providers require your own app credentials.** We do not ship shared
  client IDs - your keys, your quota, no middleman.
- **Push sync (IMAP IDLE)** is per-account for IMAP/SMTP only. Gmail/Graph
  poll on the worker interval; their webhook/push channels are a possible
  future addition but would require a publicly reachable endpoint, which
  conflicts with local-first.
- **Provider-specific labels**: Gmail categories and Exchange folders map to
  provider labels on ingest; custom IMAP flags are preserved but not synced
  back (we write via appends/flag ops where the server allows).
- **App passwords are stored encrypted** (`DZONG_SECRET_KEY`) and never
  leave the machine.
