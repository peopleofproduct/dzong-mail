# The Relay — design for the optional sync/push service

_Status: design only. Nothing in this document is built or required to run
Unwalled Mail. The local product is complete without it._

This document describes the one thing local-first email genuinely cannot do
alone — be reachable when your laptop is asleep — and how we intend to do it
without ever being able to read your mail.

## The problem

A local-first mail client is offline by definition when the machine hosting it
is closed, asleep, or behind NAT. That breaks two expectations modern users
consider basic:

1. **Mobile push** — a phone needs something always-on to hold the connection
   to Apple/Google push networks.
2. **Multi-device sync** — phone reads at the airport, desktop knows about it
   when it wakes.

Every competitor solves this by hosting your mail. That is precisely what
Unwalled exists to avoid. So the relay is designed around a single constraint:

> **The relay moves ciphertext, never plaintext. We can operate it and still
> be unable to read what passes through it.**

## Architecture

```
 your device A                 relay (optional)               your device B
┌──────────────┐   encrypted blob   ┌───────────┐   encrypted blob   ┌──────────┐
│ encrypt with │ ─────────────────► │ store &   │ ─────────────────► │ decrypt  │
│ your keys    │ ◄───────────────── │ forward   │ ◄───────────────── │ locally  │
└──────────────┘   push wake token  └───────────┘   APNs/FCM         └──────────┘
```

- **Payloads** — sync events, new-mail notifications, and small state deltas,
  encrypted on-device with keys only the user's devices hold (derived from a
  device-pairing secret; the relay never sees key material).
- **The relay stores** opaque, addressable blobs with an expiry — just enough
  to bridge devices that are never online simultaneously.
- **Push** — the relay holds only an APNs/FCM token and an opaque mailbox id.
  A wake notification carries no content; the device fetches and decrypts the
  blob itself.
- **Accounts** — an account is a public key. No email, no profile. Billing
  (if hosted by us) attaches to the account key, not your identity.

## What the relay can never see

Message content, subjects, senders, folders, labels, search data — all inside
the encrypted envelope. What it _can_ observe is metadata inherent to any
relay: traffic timing, blob sizes, device IPs. The design should minimize even
that (no per-message fan-out logs, batch where possible, pad sizes) and we'll
say so honestly in the docs.

## Why self-hostable

The relay is a dumb store-and-forward — a few hundred lines. Like everything
else in this repo it will be MIT-licensed; running your own on a $5 VPS or
Tailscale endpoint is fully supported. Paying us means paying for our uptime
and push-network plumbing, not for code you could fork. That's the honest
tier: the only thing we ever charge for is a service that costs us money to
run.

## Non-goals

- **Not a mail server.** No SMTP ingestion, no mailbox hosting, no IMAP
  proxy. Mail still flows provider → your devices directly.
- **Not a gate.** Every feature in the local product works forever without
  it. Desktop-only users will never know it exists.
- **Not sync of trust.** The relay is untrusted infrastructure in the
  security model — a compromised relay learns ciphertext and timing, nothing
  else.

## Open questions (for when we build it)

- Pairing UX: QR-code device linking vs. manual key entry.
- Blob retention window vs. storage cost (likely 7–30 days).
- Whether desktop→desktop LAN sync ships first (free, no relay at all).
