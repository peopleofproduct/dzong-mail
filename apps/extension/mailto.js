/* mailto: interception - reroute mailto: link clicks into Dzong's
 * composer instead of whatever the OS/browser would open. Runs at
 * document_start in the capture phase so single-page apps can't swallow
 * the event first. */

function parseMailto(href) {
  try {
    const url = new URL(href);
    const fields = {};
    const addr = decodeURIComponent(url.pathname || "");
    if (addr) fields.to = addr;
    for (const key of ["to", "cc", "bcc", "subject", "body"]) {
      const v = url.searchParams.get(key);
      if (v) fields[key] = fields[key] ? `${fields[key]}, ${v}` : v;
    }
    return fields;
  } catch {
    return null;
  }
}

let interceptEnabled = true;
chrome.storage.local.get({ interceptMailto: true }, (stored) => {
  interceptEnabled = stored.interceptMailto;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "interceptMailto" in changes) {
    interceptEnabled = changes.interceptMailto.newValue;
  }
});

document.addEventListener(
  "click",
  (event) => {
    if (!interceptEnabled) return;
    const anchor = event.target?.closest?.("a[href^='mailto:']");
    if (!anchor) return;
    const fields = parseMailto(anchor.getAttribute("href"));
    if (!fields) return;
    event.preventDefault();
    event.stopPropagation();
    chrome.runtime.sendMessage({ type: "mailto", fields });
  },
  true
);
