import * as cheerio from "cheerio";
import type { FetchContext, RawJob, Source } from "../types.js";
import { politeFetchTextCached } from "../net.js";

const SEARCH_TERMS = ["software engineer", "research software engineer", "software developer"];
const PAGE_SIZE = 25;
const MAX_PAGES_PER_TERM = 2;

/** "22 Oct" -> ISO date, assuming the current year (or the previous year if that would
 *  put the date more than ~45 days in the future, e.g. scraping in January about a December post). */
function parseUkDayMonth(text: string, now: Date): string | undefined {
  const m = text.trim().match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if (!m) return undefined;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const day = Number(m[1]);
  const monthIndex = months.indexOf(m[2]!.toLowerCase());
  if (monthIndex === -1) return undefined;

  let year = now.getFullYear();
  let candidate = new Date(Date.UTC(year, monthIndex, day));
  const fortyFiveDaysMs = 45 * 24 * 60 * 60 * 1000;
  if (candidate.getTime() - now.getTime() > fortyFiveDaysMs) {
    year -= 1;
    candidate = new Date(Date.UTC(year, monthIndex, day));
  }
  return candidate.toISOString();
}

function findLabelledDiv($: cheerio.CheerioAPI, scope: ReturnType<cheerio.CheerioAPI>, label: string): string {
  let text = "";
  scope.find("div").each((_, el) => {
    const t = $(el).text().trim();
    if (t.startsWith(label)) text = t.slice(label.length).trim();
  });
  return text;
}

export function parseCards(html: string, now: Date): RawJob[] {
  const $ = cheerio.load(html);
  const jobs: RawJob[] = [];

  $(".j-search-result__result[data-advert-id]").each((_, el) => {
    const card = $(el);
    const link = card.find(".j-search-result__text > a").first();
    const href = link.attr("href");
    const title = link.text().trim();
    if (!href || !title) return;

    const employerRaw = card.find(".j-search-result__employer").text().trim();
    const location = findLabelledDiv($, card, "Location:");
    const salaryText = card
      .find(".j-search-result__info")
      .text()
      .trim()
      .replace(/^Salary:\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const datePlaced = findLabelledDiv($, card, "Date Placed:");
    const closingText = card.find(".j-search-result__date .j-search-result__date--blue").first().text().trim();

    jobs.push({
      title,
      employerRaw: employerRaw || "Unknown",
      location: location || undefined,
      salaryText: salaryText || undefined,
      url: new URL(href, "https://www.jobs.ac.uk").toString(),
      postedAt: datePlaced ? parseUkDayMonth(datePlaced, now) : undefined,
      closingAt: closingText ? parseUkDayMonth(closingText, now) : undefined,
    });
  });

  return jobs;
}

/** University, research, and RSE roles - UK HE/research employers frequently sponsor
 *  Skilled Worker visas and the salary floor is usually clear on the posting itself. */
export const jobsAcUkSource: Source = {
  id: "jobsacuk",

  async fetchJobs(ctx: FetchContext): Promise<RawJob[]> {
    const now = new Date();
    const jobs: RawJob[] = [];
    const seenUrls = new Set<string>();

    for (const term of SEARCH_TERMS) {
      for (let page = 0; page < MAX_PAGES_PER_TERM; page++) {
        const startIndex = page * PAGE_SIZE + 1;
        const url = `https://www.jobs.ac.uk/search/?keywords=${encodeURIComponent(term)}&sortOrder=1&pageSize=${PAGE_SIZE}&startIndex=${startIndex}`;
        const cacheKey = `jobsacuk-${term.replace(/\s+/g, "-")}-${startIndex}`;
        const html = await politeFetchTextCached(url, ctx, cacheKey);
        const pageJobs = parseCards(html, now);
        if (pageJobs.length === 0) break;

        for (const job of pageJobs) {
          if (seenUrls.has(job.url)) continue;
          seenUrls.add(job.url);
          jobs.push(job);
        }

        if (pageJobs.length < PAGE_SIZE) break;
      }
    }

    return jobs;
  },
};
