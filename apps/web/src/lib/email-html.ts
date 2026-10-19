import sanitizeHtml from "sanitize-html";

const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/**
 * Sanitize synced email HTML for in-app display. Strips scripts, forms,
 * iframes and dangerous attributes; keeps formatting, tables and images so
 * newsletters and HTML mail render like they do in Gmail.
 *
 * `cidMap` maps inline-attachment Content-IDs to local attachment row ids so
 * `src="cid:…"` images resolve to downloaded files. Unmapped cids become a
 * transparent pixel rather than a broken-image icon.
 */
export function cleanEmailHtml(html: string, cidMap?: Map<string, string>): string {
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
        // Backgrounds are common for newsletter banners — allow everything
        // except scriptable constructs.
        background: [/^(?!.*(javascript|vbscript|expression)).*$/i],
        "background-image": [/^(?!.*(javascript|vbscript|expression)).*$/i],
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
        height: [/^.*$/],
        padding: [/^.*$/],
        "padding-top": [/^.*$/],
        "padding-right": [/^.*$/],
        "padding-bottom": [/^.*$/],
        "padding-left": [/^.*$/],
        margin: [/^.*$/],
        "margin-top": [/^.*$/],
        "margin-right": [/^.*$/],
        "margin-bottom": [/^.*$/],
        "margin-left": [/^.*$/],
        "border-radius": [/^.*$/],
      },
    },
    allowedSchemes: ["http", "https", "data", "mailto"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, loading: "lazy" },
      }),
    },
  });
}
