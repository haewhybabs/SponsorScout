import * as cheerio from "cheerio";
import type { FetchContext, RawJob, Source } from "../types.js";
import { politeFetchTextCached } from "../net.js";
import { extractJobPostingJsonLd, jobPostingLocationText } from "./jsonLd.js";
import { htmlToText } from "./htmlText.js";
import { isLikelyTechRole } from "./huntukvisasponsors.js";

const BLOG_URL = "https://nextleveljobs.eu/blog/visa-sponsorship/gb";
const MAX_DETAIL_FETCHES = 80;

type Candidate = { title: string; url: string };

function parseCompanySlugs(html: string): string[] {
  const $ = cheerio.load(html);
  const slugs = new Set<string>();
  $('a[href^="/companies/"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/^\/companies\/([a-zA-Z0-9_-]+)$/);
    if (match) slugs.add(match[1]!);
  });
  return [...slugs];
}

export function parseCompanyPage(html: string): Candidate[] {
  const $ = cheerio.load(html);
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  $('p a[href*="/jobs/"]').each((_, el) => {
    const link = $(el);
    const href = link.attr("href");
    const title = link.text().trim();
    if (!href || !title) return;
    const url = new URL(href, "https://nextleveljobs.eu").toString();
    if (seen.has(url)) return;
    seen.add(url);
    candidates.push({ title, url });
  });

  return candidates;
}

export function mapNextLevelDetailPage(html: string, url: string): RawJob | undefined {
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

/** A short curated list of ~16-18 elite employers (Google/DeepMind, Anthropic, OpenAI, Stripe,
 *  Cloudflare, Jane Street, ...) known to sponsor Skilled Worker visas for engineers in the UK. */
export const nextLevelJobsSource: Source = {
  id: "nextleveljobs",

  async fetchJobs(ctx: FetchContext): Promise<RawJob[]> {
    const blogHtml = await politeFetchTextCached(BLOG_URL, ctx, "nextleveljobs-blog");
    const companySlugs = parseCompanySlugs(blogHtml);

    const candidates: Candidate[] = [];
    const seenUrls = new Set<string>();
    for (const slug of companySlugs) {
      const companyUrl = `https://nextleveljobs.eu/companies/${slug}`;
      let companyHtml: string;
      try {
        companyHtml = await politeFetchTextCached(companyUrl, ctx, `nextleveljobs-company-${slug}`);
      } catch (err) {
        ctx.log(`nextleveljobs: failed to fetch ${companyUrl}: ${(err as Error).message}`);
        continue;
      }
      for (const candidate of parseCompanyPage(companyHtml)) {
        if (seenUrls.has(candidate.url)) continue;
        seenUrls.add(candidate.url);
        if (isLikelyTechRole({ title: candidate.title })) candidates.push(candidate);
      }
    }

    if (candidates.length > MAX_DETAIL_FETCHES) {
      ctx.log(`nextleveljobs: ${candidates.length} candidates, fetching only the first ${MAX_DETAIL_FETCHES}`);
    }

    const jobs: RawJob[] = [];
    for (const candidate of candidates.slice(0, MAX_DETAIL_FETCHES)) {
      const slug = candidate.url.split("/").pop() ?? candidate.url;
      let detailHtml: string;
      try {
        detailHtml = await politeFetchTextCached(candidate.url, ctx, `nextleveljobs-job-${slug}`);
      } catch (err) {
        ctx.log(`nextleveljobs: failed to fetch ${candidate.url}: ${(err as Error).message}`);
        continue;
      }

      const job = mapNextLevelDetailPage(detailHtml, candidate.url);
      if (!job) {
        ctx.log(`nextleveljobs: no JobPosting data found on ${candidate.url}, skipping`);
        continue;
      }
      jobs.push(job);
    }

    return jobs;
  },
};
