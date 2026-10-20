/* Contact hover cards - hover any mailto: link for ~400ms and a small
 * dossier card appears: exchange count, unread mail, open reply loops,
 * last subject. Powered by /api/v1/contacts on the local app. */

const CARD_ID = "unwalled-contact-card";
const cache = new Map(); // email -> {known,...} | "pending"
let card = null;
let hoverTimer = null;
let currentAnchor = null;

function cardEl() {
  if (!card) {
    card = document.createElement("div");
    card.id = CARD_ID;
    card.style.cssText = [
      "position:absolute",
      "z-index:2147483647",
      "background:#fff",
      "color:#0f172a",
      "border:1px solid #e2e8f0",
      "border-radius:10px",
      "box-shadow:0 8px 24px rgba(15,23,42,.18)",
      "padding:10px 12px",
      "font:12px/1.5 -apple-system,'Segoe UI',system-ui,sans-serif",
      "max-width:260px",
      "cursor:default",
    ].join(";");
    card.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    card.addEventListener("mouseleave", hideCard);
    document.documentElement.appendChild(card);
  }
  return card;
}

let hideTimer = null;
function hideCard() {
  if (card) card.style.display = "none";
}
function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideCard, 250);
}

async function settings() {
  const stored = await chrome.storage.local.get({ appUrl: "http://localhost:3000", apiToken: "" });
  return stored;
}

async function fetchContact(email) {
  if (cache.has(email)) return cache.get(email);
  cache.set(email, "pending");
  try {
    const s = await settings();
    const res = await fetch(
      `${s.appUrl}/api/v1/contacts?email=${encodeURIComponent(email)}`,
      { headers: s.apiToken ? { Authorization: `Bearer ${s.apiToken}` } : {} }
    );
    const data = res.ok ? await res.json() : null;
    cache.set(email, data);
    return data;
  } catch {
    cache.delete(email); // retry next hover
    return null;
  }
}

function render(email, data) {
  const el = cardEl();
  const rows = [];
  rows.push(`<div style="font-weight:600;margin-bottom:2px">${email}</div>`);
  if (!data) {
    rows.push(`<div style="color:#94a3b8">Checking your mail…</div>`);
  } else if (!data.known) {
    rows.push(`<div style="color:#64748b">No mail from this sender yet.</div>`);
  } else {
    const bits = [];
    if (data.unread > 0) bits.push(`${data.unread} unread`);
    if (data.needsReply > 0) bits.push(`${data.needsReply} awaiting your reply`);
    if (bits.length)
      rows.push(`<div style="color:#4f46e5;font-weight:500">${bits.join(" · ")}</div>`);
    if (data.lastSubject) {
      const when = data.lastAt ? new Date(data.lastAt).toLocaleDateString() : "";
      rows.push(
        `<div style="color:#64748b;margin-top:2px">last: ${String(data.lastSubject).slice(0, 60)}${when ? ` · ${when}` : ""}</div>`
      );
    }
    rows.push(
      `<div style="margin-top:4px"><a href="#" id="unwalled-dossier" style="color:#4f46e5;text-decoration:none;font-weight:500">Open dossier →</a></div>`
    );
  }
  el.innerHTML = rows.join("");
  el.style.display = "block";
  el.querySelector("#unwalled-dossier")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const s = await settings();
    chrome.runtime.sendMessage({
      type: "open",
      path: `/senders/${encodeURIComponent(email)}`,
    });
    hideCard();
  });
  return el;
}

function position(anchor) {
  const rect = anchor.getBoundingClientRect();
  const el = cardEl();
  el.style.top = `${window.scrollY + rect.bottom + 6}px`;
  el.style.left = `${Math.min(window.scrollX + rect.left, window.scrollX + document.documentElement.clientWidth - 270)}px`;
}

document.addEventListener(
  "mouseover",
  (event) => {
    const anchor = event.target?.closest?.("a[href^='mailto:']");
    if (!anchor) return;
    if (anchor === currentAnchor) return;
    currentAnchor = anchor;
    clearTimeout(hoverTimer);
    const email = decodeURIComponent(
      (anchor.getAttribute("href") || "").replace(/^mailto:/i, "").split("?")[0]
    ).trim();
    if (!email.includes("@")) return;
    hoverTimer = setTimeout(async () => {
      position(anchor);
      const cached = cache.get(email);
      render(email, cached && cached !== "pending" ? cached : null);
      const data = await fetchContact(email);
      if (currentAnchor === anchor) render(email, data);
    }, 400);
  },
  true
);

document.addEventListener(
  "mouseout",
  (event) => {
    const anchor = event.target?.closest?.("a[href^='mailto:']");
    if (!anchor || anchor !== currentAnchor) return;
    currentAnchor = null;
    clearTimeout(hoverTimer);
    scheduleHide();
  },
  true
);

document.addEventListener("scroll", hideCard, true);
