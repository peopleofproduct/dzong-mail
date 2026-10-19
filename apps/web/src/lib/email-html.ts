import sanitizeHtml from "sanitize-html";

/**
 * Sanitize synced email HTML for in-app display. Strips scripts, forms,
 * iframes and dangerous attributes; keeps formatting, tables and images so
 * newsletters and HTML mail render like they do in Gmail.
 */
export function cleanEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "center",
      "font",
      "u",
      "tbody",
      "tfoot",
      "th",
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
