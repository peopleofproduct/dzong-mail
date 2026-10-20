/**
 * Convert a plain-text email body into a small HTML document: paragraphs
 * preserved, URLs linkified. Output only uses tags/attributes the display
 * sanitizer allows, so it can pass straight through cleanEmailHtml.
 *
 * Used wherever text-only content must still render in the structured
 * viewer — drafts (which historically stored only bodyText and showed as
 * raw blobs with unlinked URLs), text-only sends, and imported mail.
 */
const URL_RE = /\b(?:https?:\/\/|mailto:)[^\s<>"']+[^\s<>"'.,;:!?)\]"']/g;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return "";

  return paragraphs
    .map((p) => {
      const body = escapeHtml(p)
        .replace(URL_RE, (url) => `<a href="${url}">${url}</a>`)
        .replace(/\n/g, "<br>");
      return `<p>${body}</p>`;
    })
    .join("\n");
}
