import * as cheerio from "cheerio";

/** Strip tags from real HTML and collapse whitespace into plain text. */
export function htmlToText(html: string): string {
  return cheerio
    .load(html)
    .text()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Greenhouse's `content` field is HTML-entity-encoded HTML (e.g. "&lt;div&gt;...").
 * Decode entities once to recover real markup, then strip tags.
 */
export function greenhouseContentToText(content: string): string {
  const decodedOnce = cheerio.load(`<div>${content}</div>`).text();
  return htmlToText(decodedOnce);
}
