import * as cheerio from "cheerio";
import type { FetchContext, RawJob, Source } from "../types.js";
import { politeFetchTextCached } from "../net.js";
import { extractJobPostingJsonLd, jobPostingLocationText } from "./jsonLd.js";
import { htmlToText } from "./htmlText.js";
import { isLikelyTechRole } from "./huntukvisasponsors.js";

const LISTING_URL = "https://www.landed.jobs/visa-sponsorship/uk";
const MAX_DETAIL_FETCHES = 80;

type Candidate = { title: string; url: string };

/** landed.jobs explicitly cross-references the Home Office sponsor register per company
 *  ("UK register, <date>" badge), grouping multiple open roles under each employer. */
export function parseListingPage(html: string): Candidate[] {
  const $ = cheerio.load(html);
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  $("article").each((_, article) => {
    $(article)
      .find('a[href^="/jobs/"]')
      .each((_, el) => {
        const link = $(el);
        const href = link.attr("href");
        if (!href) return;
        const url = new URL(href, "https://www.landed.jobs").toString();
        if (seen.has(url)) return;
        seen.add(url);

        const title = link.find("span").first().text().trim();
        if (!title) return;
        candidates.push({ title, url });
      });
  });

  return candidates;
}

export function mapLandedDetailPage(html: string, url: string): RawJob | undefined {
  const posting = extractJobPostingJsonLd(html);
  if (!posting || !posting.title) return undefined;

  return {
    title: posting.title,
    employerRaw: posting.hiringOrganization?.name ?? "Unknown",
    location: jobPostingLocationText(posting.jobLocation),
    url,
    description: posting.description ? htmlToText(posting.description) : undefined,
    postedAt: posting.datePosted,
    closingAt: posting.validThrough,
  };
}

export const landedJobsSource: Source = {
  id: "landedjobs",

  async fetchJobs(ctx: FetchContext): Promise<RawJob[]> {
    const html = await politeFetchTextCached(LISTING_URL, ctx, "landedjobs-listing");
    const candidates = parseListingPage(html).filter((c) => isLikelyTechRole({ title: c.title }));

    if (candidates.length > MAX_DETAIL_FETCHES) {
      ctx.log(`landedjobs: ${candidates.length} candidates, fetching only the first ${MAX_DETAIL_FETCHES}`);
    }

    const jobs: RawJob[] = [];
    for (const candidate of candidates.slice(0, MAX_DETAIL_FETCHES)) {
      const slug = candidate.url.split("/").pop() ?? candidate.url;
      let detailHtml: string;
      try {
        detailHtml = await politeFetchTextCached(candidate.url, ctx, `landedjobs-job-${slug}`);
      } catch (err) {
        ctx.log(`landedjobs: failed to fetch ${candidate.url}: ${(err as Error).message}`);
        continue;
      }

      const job = mapLandedDetailPage(detailHtml, candidate.url);
      if (!job) {
        ctx.log(`landedjobs: no JobPosting data found on ${candidate.url}, skipping`);
        continue;
      }
      jobs.push(job);
    }

    return jobs;
  },
};
