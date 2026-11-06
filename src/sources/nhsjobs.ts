import * as cheerio from "cheerio";
import type { FetchContext, RawJob, Source } from "../types.js";
import { politeFetchTextCached } from "../net.js";
import { parseUkLongDate } from "./dateUtil.js";

const SEARCH_TERMS = ["software engineer", "software developer", "data engineer", "devops"];
const RESULTS_PER_PAGE = 10;
const MAX_PAGES_PER_TERM = 3;

export function parseCards(html: string): RawJob[] {
  const $ = cheerio.load(html);
  const jobs: RawJob[] = [];

  $('[data-test="search-result"]').each((_, el) => {
    const card = $(el);
    const link = card.find('[data-test="search-result-job-title"]').first();
    const href = link.attr("href");
    const title = link.text().trim();
    if (!href || !title) return;

    const locationBlock = card.find('[data-test="search-result-location"]');
    const employerRaw = locationBlock.find("h3").clone().children().remove().end().text().trim()
      || locationBlock.find("h3").text().trim();
    const location = locationBlock.find(".location-font-size").text().replace(/\s+/g, " ").trim();

    const salaryText = card
      .find('[data-test="search-result-salary"]')
      .text()
      .trim()
      .replace(/^Salary:\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const postedText = card
      .find('[data-test="search-result-publicationDate"]')
      .text()
      .trim()
      .replace(/^Date posted:\s*/i, "")
      .trim();
    const closingText = card
      .find('[data-test="search-result-closingDate"]')
      .text()
      .trim()
      .replace(/^Closing date:\s*/i, "")
      .trim();

    // The search result link carries ?keyword=...&page=... from whichever search found it -
    // strip that so the same job found via two different keyword searches gets one canonical URL.
    const canonicalUrl = new URL(href, "https://www.jobs.nhs.uk");
    canonicalUrl.search = "";

    jobs.push({
      title,
      employerRaw: employerRaw || "NHS",
      location: location || undefined,
      salaryText: salaryText || undefined,
      url: canonicalUrl.toString(),
      postedAt: postedText ? parseUkLongDate(postedText) : undefined,
      closingAt: closingText ? parseUkLongDate(closingText) : undefined,
    });
  });

  return jobs;
}

/** NHS trusts are individually licensed Skilled Worker sponsors, and digital/developer
 *  roles here usually state an exact Agenda for Change salary on the listing itself. */
export const nhsJobsSource: Source = {
  id: "nhsjobs",

  async fetchJobs(ctx: FetchContext): Promise<RawJob[]> {
    const jobs: RawJob[] = [];
    const seenUrls = new Set<string>();

    for (const term of SEARCH_TERMS) {
      for (let page = 1; page <= MAX_PAGES_PER_TERM; page++) {
        const url = `https://www.jobs.nhs.uk/candidate/search/results?keyword=${encodeURIComponent(term)}&language=en&page=${page}`;
        const cacheKey = `nhsjobs-${term.replace(/\s+/g, "-")}-${page}`;
        const html = await politeFetchTextCached(url, ctx, cacheKey);
        const pageJobs = parseCards(html);
        if (pageJobs.length === 0) break;

        for (const job of pageJobs) {
          if (seenUrls.has(job.url)) continue;
          seenUrls.add(job.url);
          jobs.push(job);
        }

        if (pageJobs.length < RESULTS_PER_PAGE) break;
      }
    }

    return jobs;
  },
};
