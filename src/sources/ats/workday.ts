import * as cheerio from "cheerio";
import type { FetchContext, RawJob, Source } from "../../types.js";
import { politeFetchJsonCached } from "../../net.js";
import { htmlToText } from "../htmlText.js";

const PAGE_SIZE = 20;
const MAX_JOBS = 200;

// Tried filtering server-side on a UK location facet (the "United Kingdom" node id is
// identical across tenants - confirmed on FCA, Ofcom, GSK - so it looked like shared
// reference data). It isn't portable: the facet *key* wrapping that id differs per tenant
// (GSK exposes a flat "Location_Country" facet; Ofcom/FCA nest it under
// "locationMainGroup.locationCountry"), and sending the wrong key 400s. Scoping by
// searchTerms server-side plus the pipeline's own isUkLocation client-side filter instead.

type ListingResponse = {
  total: number;
  jobPostings: { title: string; externalPath: string }[];
};

type DetailResponse = {
  jobPostingInfo: {
    title: string;
    jobDescription?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    jobReqId?: string;
    externalUrl?: string;
  };
};

/** Workday postings put salary inline in prose rather than a dedicated field - pull out
 *  whichever bullet/paragraph actually states it, rather than scanning the whole description
 *  (which would false-positive on unrelated £ mentions e.g. a benefits section). */
export function extractSalaryLine(descriptionHtml: string): string | undefined {
  const $ = cheerio.load(descriptionHtml);
  let found: string | undefined;
  $("li, p").each((_, el) => {
    if (found) return;
    const text = $(el).text().trim();
    if (/salary/i.test(text) && /£/.test(text)) found = text;
  });
  return found;
}

/** Parses a Workday tenant slug of the form "tenant:wdNum:site", e.g. "fca:3:FCA_Careers". */
function parseWorkdaySlug(slug: string): { tenant: string; wdNum: string; site: string } {
  const [tenant, wdNum, site] = slug.split(":");
  if (!tenant || !wdNum || !site) {
    throw new Error(`Invalid workday slug "${slug}" - expected "tenant:wdNum:site"`);
  }
  return { tenant, wdNum, site };
}

/** Small employers (regulators, public bodies) have few enough total postings that fetching
 *  everything and letting the pipeline's role filter sort it out works fine. Large multinationals
 *  (GSK has 978 total postings globally) would blow past MAX_JOBS and likely never even reach
 *  the handful of real UK software roles - for those, pass searchTerms to scope the query
 *  server-side first, the same way jobsacuk/nhsjobs search by term rather than fetching everything. */
export function createWorkdaySource(companyName: string, slug: string, searchTerms: string[] = [""]): Source {
  const { tenant, wdNum, site } = parseWorkdaySlug(slug);
  const host = `https://${tenant}.wd${wdNum}.myworkdayjobs.com`;
  const apiBase = `${host}/wday/cxs/${tenant}/${site}`;

  return {
    id: `workday:${tenant}`,

    async fetchJobs(ctx: FetchContext): Promise<RawJob[]> {
      const paths = new Set<string>();
      for (const searchText of searchTerms) {
        let offset = 0;
        for (let page = 0; offset < MAX_JOBS && paths.size < MAX_JOBS; page++) {
          const listing = await politeFetchJsonCached<ListingResponse>(
            `${apiBase}/jobs`,
            ctx,
            `workday-${tenant}-listing-${searchText.replace(/\s+/g, "_") || "all"}-${page}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset, searchText }),
            },
          );
          for (const posting of listing.jobPostings) paths.add(posting.externalPath);
          offset += PAGE_SIZE;
          if (offset >= listing.total || listing.jobPostings.length === 0) break;
        }
      }

      const jobs: RawJob[] = [];
      for (const externalPath of paths) {
        let detail: DetailResponse;
        try {
          detail = await politeFetchJsonCached<DetailResponse>(
            `${apiBase}${externalPath}`,
            ctx,
            `workday-${tenant}-job-${externalPath.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
          );
        } catch (err) {
          ctx.log(`workday:${tenant}: failed to fetch ${externalPath}: ${(err as Error).message}`);
          continue;
        }

        const info = detail.jobPostingInfo;
        jobs.push({
          externalId: info.jobReqId,
          title: info.title,
          employerRaw: companyName,
          location: info.location,
          url: info.externalUrl ?? `${host}/${site}${externalPath}`,
          description: info.jobDescription ? htmlToText(info.jobDescription) : undefined,
          salaryText: info.jobDescription ? extractSalaryLine(info.jobDescription) : undefined,
          postedAt: info.startDate,
          closingAt: info.endDate,
        });
      }

      return jobs;
    },
  };
}
