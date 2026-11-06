import { createHash } from "node:crypto";

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gh_src",
  "gh_jid",
  "ref",
  "lever-source",
];

/** Strip tracking params, fragments, and trailing slashes so equivalent URLs hash the same. */
export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return url.trim();
  }
}

/** Stable id for a job: source + external id when available, else the canonical URL. */
export function computeJobId(source: string, externalId: string | undefined, url: string): string {
  const key = externalId ? `${source}:${externalId}` : `url:${canonicalizeUrl(url)}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}
