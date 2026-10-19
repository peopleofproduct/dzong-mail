const DEFAULTS = {
  appUrl: "http://localhost:3000",
  apiToken: "",
};

const $ = (id) => document.getElementById(id);

async function settings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

function appUrl(s, path) {
  return `${s.appUrl.replace(/\/+$/, "")}${path}`;
}

function open(path) {
  settings().then((s) => chrome.tabs.create({ url: appUrl(s, path) }));
}

async function load() {
  const s = await settings();
  const status = $("status");
  try {
    const res = await fetch(appUrl(s, "/api/v1/notifications"), {
      headers: s.apiToken ? { Authorization: `Bearer ${s.apiToken}` } : {},
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    status.textContent =
      data.unread > 0 ? `${data.unread} unread` : "Inbox clear";
    status.className = "";
    const badge = $("unread");
    badge.hidden = data.unread === 0;
    badge.textContent = data.unread;

    const items = $("items");
    items.innerHTML = "";
    const recent = (data.items ?? []).slice(0, 6);
    if (recent.length === 0) {
      status.textContent += " - nothing new yet";
    }
    for (const n of recent) {
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.className = "t";
      t.textContent = n.title;
      const b = document.createElement("span");
      b.className = "b";
      b.textContent = (n.body ?? "").slice(0, 80);
      li.append(t, b);
      li.addEventListener("click", () => open(`/?thread=${n.threadId ?? ""}`));
      items.appendChild(li);
    }
  } catch {
    status.textContent = "Can't reach the app - is it running?";
    status.className = "err";
  }
}

$("open").addEventListener("click", () => open("/"));
$("compose").addEventListener("click", () => open("/?compose=new"));
$("ask").addEventListener("click", () => open("/?ask="));
$("refresh").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "poll-now" });
  load();
});
$("options").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("email-page").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const s = await settings();
  const p = new URLSearchParams({ compose: "new" });
  if (tab?.title) p.set("subject", tab.title);
  if (tab?.url) p.set("body", tab.url);
  chrome.tabs.create({ url: appUrl(s, `/?${p}`) });
});

load();
