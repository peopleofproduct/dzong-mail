import sanitizeHtml from "sanitize-html";
import { textToHtml } from "@dzong/sync-engine";

const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/** Sender CSS that marks an element as intentionally hidden: preheader
 *  preview text, tracking stubs, mso-hide blocks. Since display/visibility
 *  are stripped from inline styles anyway, these elements would otherwise
 *  surface as stray text - remove them outright. */
const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*(hidden|collapse)|mso-hide\s*:\s*all/i;

/** Remote resource references in the raw markup — used to detect whether a
 *  message wants to phone home before we decide to offer "load images". */
const REMOTE_REF = /(?:src|background)\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:/i;

/** CSS values that must never survive: scriptable constructs and, when
 *  remote blocking is on, remote url() loads (tracking via background CSS). */
const STYLE_SAFE = /^(?!.*(javascript|vbscript|expression)).*$/i;
const STYLE_NO_REMOTE = /^(?!.*(javascript|vbscript|expression|url\s*\(\s*["']?\s*https?:)).*$/i;

export interface CleanedEmailHtml {
  /** Sanitized markup with remote content blocked — safe to render always. */
  html: string;
  /** Same sanitization with remote resources retained — render only after an
   *  explicit per-message "load images" opt-in. */
  htmlWithRemote: string;
  /** The original markup referenced remote images/CSS loads. */
  hasRemoteContent: boolean;
}

function sanitize(input: string, allowRemote: boolean): string {
  const styleRule = allowRemote ? STYLE_SAFE : STYLE_NO_REMOTE;
  return sanitizeHtml(input, {
    // sanitize-html defaults deliberately exclude img — add it back.
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "center",
      "font",
      "u",
      "tbody",
      "tfoot",
      "th",
      "figure",
      "figcaption",
    ]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      td: ["colspan", "rowspan", "width", "align"],
      th: ["colspan", "rowspan", "width", "align"],
      table: ["width", "align", "cellpadding", "cellspacing"],
      "*": ["style", "align"],
    },
    allowedStyles: {
      "*": {
        color: [/^.*$/],
        "background-color": [/^.*$/],
        background: [styleRule],
        "background-image": [styleRule],
        "background-position": [/^.*$/],
        "background-repeat": [/^.*$/],
        "background-size": [/^.*$/],
        "font-size": [/^.*$/],
        "font-weight": [/^.*$/],
        "font-style": [/^.*$/],
        "font-family": [/^.*$/],
        "text-align": [/^.*$/],
        "text-decoration": [/^.*$/],
        "line-height": [/^.*$/],
        width: [/^.*$/],
        "max-width": [/^.*$/],
        "max-height": [/^.*$/],
        height: [/^.*$/],
        display: [/^.*$/],
        overflow: [STYLE_SAFE],
        visibility: [/^.*$/],
        padding: [/^(?!.*-).*$/],
        "padding-top": [/^(?!.*-).*$/],
        "padding-right": [/^(?!.*-).*$/],
        "padding-bottom": [/^(?!.*-).*$/],
        "padding-left": [/^(?!.*-).*$/],
        // Negative margins are a common newsletter centring hack that
        // pulls content outside the preview card - keep them out.
        margin: [/^(?!.*-).*$/],
        "margin-top": [/^(?!.*-).*$/],
        "margin-right": [/^(?!.*-).*$/],
        "margin-bottom": [/^(?!.*-).*$/],
        "margin-left": [/^(?!.*-).*$/],
        "border-radius": [/^.*$/],
      },
    },
    allowedSchemes: ["http", "https", "data", "mailto"],
    // data: is for inline images only — a data:text/html anchor would open
    // an attacker-built page when clicked.
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    // Drop elements the sender meant to hide (preheader text etc.) so they
    // don't render once their hiding styles are sanitised away.
    exclusiveFilter: (frame) => !!frame.attribs?.style && HIDDEN_STYLE.test(frame.attribs.style),
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
      img: (tagName, attribs) => {
        // Remote images are tracking pixels until the user asks for them —
        // swap in a transparent placeholder, keeping layout dimensions.
        if (!allowRemote && /^https?:/i.test(attribs.src ?? "")) {
          return {
            tagName,
            attribs: { ...attribs, src: TRANSPARENT_PIXEL, loading: "lazy" },
          };
        }
        return { tagName, attribs: { ...attribs, loading: "lazy" } };
      },
    },
  });
}

/** Raw markup sitting in a bodyText field — senders that ship no text/plain
 *  part leave HTML source where plain text should be, and forwards written
 *  before fidelity carried it there too. */
const MARKUP_IN_TEXT =
  /<\s*\/?\s*(p|div|table|span|br|a|img|td|tr|section|article|html|body)\b[^>]*>/i;

/** bodyHtml that is really escaped text (an early composer escaped the whole
 *  body, markup included) — renders as literal &lt;p&gt; soup unless we
 *  re-derive the body from bodyText instead. */
const ESCAPED_MARKUP =
  /&lt;\s*\/?\s*(p|div|table|span|br|a|img|td|tr|section|article|html|body)\b/i;

/**
 * The best structured-HTML source for a message, or null when only plain
 * text exists (the viewer then uses the folded-quote text path):
 *  - real stored HTML wins,
 *  - markup accidentally stored in bodyText renders as markup (sanitized),
 *  - drafts always get structured output via textToHtml — a draft preview
 *    is never a raw text blob.
 */
export function bodyHtmlSource(m: {
  bodyHtml: string | null;
  bodyText: string | null;
  isDraft: boolean;
}): string | null {
  if (m.bodyHtml && !ESCAPED_MARKUP.test(m.bodyHtml)) return m.bodyHtml;
  const text = m.bodyText ?? "";
  if (MARKUP_IN_TEXT.test(text)) return text;
  if (m.isDraft && text.trim()) return textToHtml(text);
  return null;
}

/** Rough text/plain rendering of HTML — used for the forwarded body's text
 *  part when the original had no usable text/plain. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when a text field is really markup — shared by the forward builder
 *  so it strips rather than re-escapes. */
export const looksLikeHtml = (text: string) => MARKUP_IN_TEXT.test(text);

/**
 * Sanitize synced email HTML for in-app display. Strips scripts, forms,
 * iframes and dangerous attributes; keeps formatting, tables and images so
 * newsletters and HTML mail render like they do in Gmail.
 *
 * Privacy: remote resources never load by default — `html` replaces them
 * with placeholders; `htmlWithRemote` exists solely for the per-message
 * "load images" opt-in in the message viewer.
 *
 * `cidMap` maps inline-attachment Content-IDs to local attachment row ids so
 * `src="cid:…"` images resolve to downloaded files. Unmapped cids become a
 * transparent pixel rather than a broken-image icon.
 */
export function cleanEmailHtml(html: string, cidMap?: Map<string, string>): CleanedEmailHtml {
  let input = html;
  if (cidMap && cidMap.size > 0) {
    const resolve = (cid: string) => {
      const id = cidMap.get(decodeURIComponent(cid).replace(/[<>]/g, "").trim());
      return id ? `/api/attachments/${id}` : TRANSPARENT_PIXEL;
    };
    input = input
      .replace(/src=(["']?)cid:([^"'\s>]+)\1/gi, (_m, q: string, cid: string) => {
        return `src=${q}${resolve(cid)}${q}`;
      })
      .replace(/url\(\s*(["']?)cid:([^"')]+)\1\s*\)/gi, (_m, q: string, cid: string) => {
        return `url(${q}${resolve(cid)}${q})`;
      });
  }

  const hasRemoteContent = REMOTE_REF.test(input);
  const blocked = sanitize(input, false);
  return {
    html: blocked,
    htmlWithRemote: hasRemoteContent ? sanitize(input, true) : blocked,
    hasRemoteContent,
  };
}
