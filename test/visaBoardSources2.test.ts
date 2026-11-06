import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseListingPage as parseLandedListing, mapLandedDetailPage } from "../src/sources/landedjobs.js";
import { mapNextLevelDetailPage, parseCompanyPage } from "../src/sources/nextleveljobs.js";
import { isLikelyTechRole } from "../src/sources/huntukvisasponsors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "..", "fixtures");

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf-8");
}

describe("landedjobs", () => {
  it("parses company cards into title/url candidates", () => {
    const html = loadFixture("landedjobs-listing.html");
    const candidates = parseLandedListing(html);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.title).toBe("Recruitment Campaign Marketing Manager - Global Growth Initiatives (12m FTC)");
    expect(candidates[0]!.url).toBe("https://www.landed.jobs/jobs/785c268b-0cf3-4e55-971a-a8b6fbbcd74d");
  });

  it("the tech-role prefilter excludes clearly non-engineering roles mixed into the listing", () => {
    // landed.jobs lists every open role at each sponsor, not just engineering - the loose
    // prefilter (same one huntukvisasponsors uses) only needs to cut obvious noise before
    // spending a request on the detail page; the strict gate is pipeline/roleFilter.ts.
    expect(isLikelyTechRole({ title: "Paid Search Senior Manager" })).toBe(false);
    expect(isLikelyTechRole({ title: "Temporary Sales Assistant" })).toBe(false);
    expect(isLikelyTechRole({ title: "Director, Client Management EMEA" })).toBe(false);
  });

  it("maps a detail page's JobPosting JSON-LD into a clean RawJob", () => {
    const html = loadFixture("landedjobs-detail.html");
    const job = mapLandedDetailPage(html, "https://www.landed.jobs/jobs/045dc146-aece-4cb4-8002-bb0293c83b3d");
    expect(job).toBeDefined();
    expect(job!.title).toBe("Senior Account Manager");
    expect(job!.employerRaw).toBe("Hibob");
    expect(job!.description).not.toContain("<p>");
  });

  it("returns undefined for a page with no JobPosting JSON-LD", () => {
    const job = mapLandedDetailPage("<html><body>nothing here</body></html>", "https://example.com/x");
    expect(job).toBeUndefined();
  });
});

describe("nextleveljobs", () => {
  it("maps a detail page's JobPosting JSON-LD into a clean RawJob", () => {
    const html = loadFixture("nextleveljobs-detail.html");
    const job = mapNextLevelDetailPage(
      html,
      "https://nextleveljobs.eu/companies/cloudflare/jobs/6adc85f5dd52a7a539893375",
    );
    expect(job).toBeDefined();
    expect(job!.title).toBe("Senior Software Engineer, Workers Runtime");
    expect(job!.employerRaw).toBe("Cloudflare");
    expect(job!.location).toContain("London");
    expect(job!.postedAt).toBe("2026-10-24");
  });

  it("this source's titles are pre-filtered to engineering roles, so the tech gate passes them", () => {
    expect(isLikelyTechRole({ title: "Senior Software Engineer, Workers Runtime" })).toBe(true);
  });

  it("parses company page job cards into title/url candidates", () => {
    const html = loadFixture("nextleveljobs-company.html");
    const candidates = parseCompanyPage(html);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.url).toContain("/companies/cloudflare/jobs/");
  });
});
