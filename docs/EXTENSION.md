# Browser extension - Dzong Mail Companion

A Manifest V3 extension that makes the local app feel always-on. It talks
only to your own machine - every call goes to `localhost`, nothing is
proxied or relayed.

## What it does

- **Unread badge + desktop notifications.** A persistent background
  worker polls `/api/v1/notifications` (default: every minute) so you
  see new mail even when the app tab is closed - the one thing a PWA
  service worker can't do.
- **mailto: interception.** Email links on any page open the Dzong
  composer with `to`/`cc`/`bcc`/`subject`/`body` prefilled, instead of
  launching the OS default. Toggleable.
- **Email this page / this link.** Right-click or the toolbar popup
  composes a draft with the page title and URL prefilled.
- **Ask / search from anywhere.** Select text on any page, right-click,
  and send it to "Ask my inbox" or the mail search.
- **Popup quick view.** Unread count, the six latest notifications,
  and one-tap Open inbox / Compose / Ask.

## Install (unpacked, developer mode)

1. Run the app: `npm run dev` (default `http://localhost:3000`).
2. Open `chrome://extensions` (Chrome/Edge/Arc/Brave) or
   `about:debugging#/runtime/this-firefox` (Firefox).
3. "Load unpacked" / "Load Temporary Add-on" -> pick `apps/extension`.
4. Click the toolbar icon -> Settings link to adjust the app URL,
   poll interval, and notifications.

Chrome Web Store / addons.mozilla.org listings are planned - the
extension is designed to pass review (minimal permissions, no remote
code, documented localhost-only host access).

## Permissions, and why

| Permission                     | Used for                                   |
| ------------------------------ | ------------------------------------------ |
| `alarms`                       | periodic unread polling                    |
| `notifications`                | new-mail desktop toasts                    |
| `contextMenus`                 | right-click Email this page / Ask / Search |
| `storage`                      | settings, last-seen notification cursor    |
| `tabs`                         | opening deep links into the app            |
| `host_permissions` `localhost` | calling `/api/v1/notifications`            |

## Security model

- The app's `src/proxy.ts` answers CORS only for `*-extension://`
  origins - a scheme websites cannot forge, so no web page can read
  your local API through the browser.
- If you set `DZONG_API_TOKEN` in `apps/web/.env.local`, paste the
  same token in the extension's options; it is sent as a Bearer token.
- The extension stores no mail content - only your settings and the
  ID of the newest notification it has already toasted.
