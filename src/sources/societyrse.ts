import * as cheerio from "cheerio";
import type { FetchContext, RawJob, Source } from "../types.js";
import { politeFetchJsonCached, politeFetchTextCached } from "../net.js";
import { parseUkLongDate } from "./dateUtil.js";
import { htmlToText } from "./htmlText.js";

const AJAX_URL = "https://society-rse.org/wp-admin/admin-ajax.php";
// Vacancies anywhere in the world are welcome here, not just the UK (the pipeline's
// location filter handles narrowing that down) - this board is already small and
// already scoped to "software for research" roles, so no per-candidate tech prefilter
// or detail-page request cap is needed the way the bigger boards require.
const LISTING_BODY =
  "action=job_manager_get_listings&search_keywords=&search_location=&per_page=50&orderby=featured&order=DESC&page=1";

type ListingResponse = { found_jobs: boolean; max_num_pages: number; html: string };

export type Candidate = {
  title: string;
  employerRaw: string;
  location: string;
  url: string;
  postedAt?: string;
  closingAt?: string;
};

export function parseListingHtml(html: string): Candidate[] {
  const $ = cheerio.load(html);
  const candidates: Candidate[] = [];

  $("li.job_listing").each((_, el) => {
    const card = $(el);
    const link = card.find("> a").first();
    const href = link.attr("href");
    const title = link.find("h3").first().text().trim();
    const employerRaw = link.find(".company strong").first().text().trim();
    const location = link.find(".location").first().text().trim();
    if (!href || !title || !employerRaw) return;

    const postedAt = link.find(".date time").first().attr("datetime") || undefined;
    const closingText = link.find(".application-deadline").first().text().replace(/^Closes:\s*/i, "").trim();
    const closingAt = closingText ? parseUkLongDate(closingText) : undefined;

    candidates.push({ title, employerRaw, location, url: href, postedAt, closingAt });
  });

  return candidates;
}

export type DetailPageData = { description?: string; salaryText?: string };

export function parseDetailPage(html: string): DetailPageData {
  const $ = cheerio.load(html);
  const salaryText = $(".job-listing-meta li.salary").first().text().trim() || undefined;
  const descriptionHtml = $(".job_description").first().html();
  const description = descriptionHtml ? htmlToText(descriptionHtml) : undefined;
  return { description, salaryText };
}

export const societyRseSource: Source = {
  id: "societyrse",

  async fetchJobs(ctx: FetchContext): Promise<RawJob[]> {
    const listing = await politeFetchJsonCached<ListingResponse>(AJAX_URL, ctx, "societyrse-listing", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: LISTING_BODY,
    });

    const candidates = parseListingHtml(listing.html);
    const jobs: RawJob[] = [];

    for (const candidate of candidates) {
      let detailHtml: string;
      try {
        const slug = candidate.url.replace(/\/$/, "").split("/").pop() ?? candidate.url;
        detailHtml = await politeFetchTextCached(candidate.url, ctx, `societyrse-job-${slug}`);
      } catch (err) {
        ctx.log(`societyrse: failed to fetch ${candidate.url}: ${(err as Error).message}`);
        continue;
      }

      const { description, salaryText } = parseDetailPage(detailHtml);
      jobs.push({
        title: candidate.title,
        employerRaw: candidate.employerRaw,
        location: candidate.location || undefined,
        url: candidate.url,
        description,
        salaryText,
        postedAt: candidate.postedAt,
        closingAt: candidate.closingAt,
      });
    }

    return jobs;
  },
};
