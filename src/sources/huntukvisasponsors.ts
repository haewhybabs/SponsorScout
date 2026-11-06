import Parser from "rss-parser";
import type { FetchContext, RawJob, Source } from "../types.js";
import { politeFetchTextCached } from "../net.js";
import { extractJobPostingJsonLd, jobPostingLocationText } from "./jsonLd.js";
import { htmlToText } from "./htmlText.js";
import { TECH_TITLE_PATTERN } from "./techKeywords.js";

const FEED_URL = "https://huntukvisasponsors.com/jobs/feed.xml";

/** Cap on detail pages fetched per run - politeness, not all 200 feed items are relevant. */
const MAX_DETAIL_FETCHES = 80;

function jobPageCacheKey(url: string): string {
  const slug = url.split("/").pop() ?? url;
  return `huntukvisasponsors-job-${slug}`;
}

export function isLikelyTechRole(item: { title?: string; contentSnippet?: string; content?: string }): boolean {
  const haystack = `${item.title ?? ""} ${item.contentSnippet ?? item.content ?? ""}`;
  return TECH_TITLE_PATTERN.test(haystack);
}

/** Map a fetched job detail page's JSON-LD JobPosting into a RawJob. Returns undefined if the
 *  page has no usable JobPosting data (the whole point of fetching the page in the first place). */
export function mapHuntUkDetailPage(html: string, url: string): RawJob | undefined {
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

export const huntUkVisaSponsorsSource: Source = {
  id: "huntukvisasponsors",

  async fetchJobs(ctx: FetchContext): Promise<RawJob[]> {
    const xml = await politeFetchTextCached(FEED_URL, ctx, "huntukvisasponsors-feed");
    const parser = new Parser();
    const feed = await parser.parseString(xml);

    const candidates = (feed.items ?? []).filter(isLikelyTechRole);

    if (candidates.length > MAX_DETAIL_FETCHES) {
      ctx.log(
        `huntukvisasponsors: ${candidates.length} candidate jobs found, fetching only the first ${MAX_DETAIL_FETCHES}`,
      );
    }

    const jobs: RawJob[] = [];
    for (const item of candidates.slice(0, MAX_DETAIL_FETCHES)) {
      const url = item.link;
      if (!url) continue;

      let html: string;
      try {
        html = await politeFetchTextCached(url, ctx, jobPageCacheKey(url));
      } catch (err) {
        ctx.log(`huntukvisasponsors: failed to fetch ${url}: ${(err as Error).message}`);
        continue;
      }

      const job = mapHuntUkDetailPage(html, url);
      if (!job) {
        ctx.log(`huntukvisasponsors: no JobPosting data found on ${url}, skipping`);
        continue;
      }
      jobs.push(job);
    }

    return jobs;
  },
};
