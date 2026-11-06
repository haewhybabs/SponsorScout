import * as cheerio from "cheerio";

export type JobPostingJsonLd = {
  title?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  hiringOrganization?: { name?: string };
  jobLocation?: {
    address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string };
  };
};

/** Find a schema.org JobPosting block embedded as JSON-LD in a job detail page, if present. */
export function extractJobPostingJsonLd(html: string): JobPostingJsonLd | undefined {
  const $ = cheerio.load(html);
  let result: JobPostingJsonLd | undefined;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (result) return;
    const raw = $(el).contents().text();
    try {
      const data = JSON.parse(raw) as unknown;
      const candidates = Array.isArray(data) ? data : [data];
      for (const d of candidates) {
        if (d && typeof d === "object" && (d as Record<string, unknown>)["@type"] === "JobPosting") {
          result = d as JobPostingJsonLd;
          break;
        }
      }
    } catch {
      // malformed JSON-LD on the page - skip it, not our data to fix
    }
  });

  return result;
}

export function jobPostingLocationText(loc: JobPostingJsonLd["jobLocation"]): string | undefined {
  const addr = loc?.address;
  if (!addr) return undefined;
  return [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(", ") || undefined;
}
