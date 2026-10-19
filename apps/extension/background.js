/* Unwalled Mail Companion - background service worker (MV3).
 * Polls the local API for the unread count and new notifications,
 * wires context menus, handles mailto redirects, and opens deep links
 * into the app. All state lives in chrome.storage so the worker can be
 * suspended and revived freely. */

const DEFAULTS = {
  appUrl: "http://localhost:3000",
  apiToken: "",
  pollMinutes: 1,
  notifyEnabled: true,
  interceptMailto: true,
};

const ALARM_NAME = "unwalled-poll";
const MAX_TOASTS_PER_POLL = 3;

async function settings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

function authHeaders(s) {
  return s.apiToken ? { Authorization: `Bearer ${s.apiToken}` } : {};
}

function appUrl(s, path) {
  return `${s.appUrl.replace(/\/+$/, "")}${path}`;
}

async function openTab(url) {
  await chrome.tabs.create({ url });
}

/* ---- polling: unread badge + new-mail toasts ---- */

async function poll() {
  const s = await settings();
  try {
    const res = await fetch(appUrl(s, "/api/v1/notifications"), {
      headers: authHeaders(s),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    await chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
    await chrome.action.setBadgeText({
      text: data.unread > 0 ? String(Math.min(data.unread, 99)) : "",
    });

    if (!s.notifyEnabled) return;

    const stored = await chrome.storage.local.get({ lastSeenAt: 0 });
    const fresh = (data.items ?? [])
      .filter((n) => !n.readAt && new Date(n.createdAt).getTime() > stored.lastSeenAt)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const { toastThreads = {} } = await chrome.storage.local.get({
      toastThreads: {},
    });
    for (const n of fresh.slice(-MAX_TOASTS_PER_POLL)) {
      await chrome.notifications.create(`unwalled-${n.id}`, {
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: n.title,
        message: n.body ?? "",
        contextMessage: "Unwalled Mail",
      });
      if (n.threadId) toastThreads[n.id] = n.threadId;
    }
    const ids = Object.keys(toastThreads);
    if (ids.length > 50) {
      for (const stale of ids.slice(0, ids.length - 50)) delete toastThreads[stale];
    }
    await chrome.storage.local.set({ toastThreads });
    const newest = data.items?.[0];
    if (newest) {
      await chrome.storage.local.set({
        lastSeenAt: Math.max(
          stored.lastSeenAt,
          new Date(newest.createdAt).getTime()
        ),
      });
    }
    await chrome.storage.local.set({ lastPollOk: true });
  } catch {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#94a3b8" });
    await chrome.storage.local.set({ lastPollOk: false });
  }
}

async function ensureAlarm() {
  const s = await settings();
  const existing = await chrome.alarms.get(ALARM_NAME);
  const period = Math.max(0.5, Number(s.pollMinutes) || 1);
  if (!existing || existing.periodInMinutes !== period) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: period });
  }
}

/* ---- context menus ---- */

const MENUS = [
  { id: "uw-email-page", title: "Email this page", contexts: ["page"] },
  { id: "uw-email-link", title: "Email this link", contexts: ["link"] },
  { id: "uw-ask-selection", title: 'Ask my inbox about "%s"', contexts: ["selection"] },
  { id: "uw-search-selection", title: 'Search my mail for "%s"', contexts: ["selection"] },
];

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    for (const m of MENUS) chrome.contextMenus.create(m);
  });
}

async function composeUrl(s, fields) {
  const p = new URLSearchParams({ compose: "new" });
  for (const [k, v] of Object.entries(fields)) if (v) p.set(k, v);
  return appUrl(s, `/?${p}`);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const s = await settings();
  if (info.menuItemId === "uw-email-page") {
    await openTab(await composeUrl(s, { subject: tab?.title, body: tab?.url }));
  } else if (info.menuItemId === "uw-email-link") {
    await openTab(await composeUrl(s, { body: info.linkUrl }));
  } else if (info.menuItemId === "uw-ask-selection") {
    await openTab(appUrl(s, `/?ask=${encodeURIComponent(info.selectionText)}`));
  } else if (info.menuItemId === "uw-search-selection") {
    await openTab(appUrl(s, `/?q=${encodeURIComponent(info.selectionText)}`));
  }
});

/* ---- notification clicks -> the thread ---- */

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const s = await settings();
  const notifId = notificationId.replace(/^unwalled-/, "");
  const { toastThreads = {} } = await chrome.storage.local.get({
    toastThreads: {},
  });
  const threadId = toastThreads[notifId];
  await openTab(appUrl(s, threadId ? `/?thread=${threadId}` : "/"));
  chrome.notifications.clear(notificationId);
});

/* ---- messages from content scripts / popup ---- */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    const s = await settings();
    if (msg?.type === "mailto") {
      await openTab(await composeUrl(s, msg.fields));
    } else if (msg?.type === "open") {
      await openTab(appUrl(s, msg.path ?? "/"));
    } else if (msg?.type === "poll-now") {
      await poll();
      sendResponse({ ok: true });
      return;
    } else if (msg?.type === "settings-changed") {
      await ensureAlarm();
      await poll();
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: true });
  })();
  return true;
});

/* ---- lifecycle ---- */

chrome.runtime.onInstalled.addListener(() => {
  setupMenus();
  ensureAlarm().then(poll);
});

chrome.runtime.onStartup.addListener(() => {
  setupMenus();
  ensureAlarm().then(poll);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) poll();
});
