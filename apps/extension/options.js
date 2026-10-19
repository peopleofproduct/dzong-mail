const DEFAULTS = {
  appUrl: "http://localhost:3000",
  apiToken: "",
  pollMinutes: 1,
  notifyEnabled: true,
  interceptMailto: true,
};

const $ = (id) => document.getElementById(id);

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  $("appUrl").value = s.appUrl;
  $("apiToken").value = s.apiToken;
  $("pollMinutes").value = s.pollMinutes;
  $("notifyEnabled").checked = s.notifyEnabled;
  $("interceptMailto").checked = s.interceptMailto;
}

function readForm() {
  return {
    appUrl: ($("appUrl").value || DEFAULTS.appUrl).replace(/\/+$/, ""),
    apiToken: $("apiToken").value.trim(),
    pollMinutes: Math.max(0.5, Number($("pollMinutes").value) || 1),
    notifyEnabled: $("notifyEnabled").checked,
    interceptMailto: $("interceptMailto").checked,
  };
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set(readForm());
  chrome.runtime.sendMessage({ type: "settings-changed" });
  const r = $("result");
  r.className = "ok";
  r.textContent = "Saved.";
});

$("test").addEventListener("click", async () => {
  const s = readForm();
  const r = $("result");
  r.className = "";
  r.textContent = "Connecting…";
  try {
    const res = await fetch(`${s.appUrl}/api/v1/notifications`, {
      headers: s.apiToken ? { Authorization: `Bearer ${s.apiToken}` } : {},
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    r.className = "ok";
    r.textContent = `Connected - ${data.unread} unread notification${data.unread === 1 ? "" : "s"}.`;
  } catch (e) {
    r.className = "err";
    r.textContent = `Couldn't reach ${s.appUrl} - is the app running? (${e.message})`;
  }
});

load();
