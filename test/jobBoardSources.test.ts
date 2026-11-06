import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Parser from "rss-parser";
import { isLikelyTechRole, mapHuntUkDetailPage } from "../src/sources/huntukvisasponsors.js";
import { parseCards as parseJobsAcUkCards } from "../src/sources/jobsacuk.js";
import { parseCards as parseNhsCards } from "../src/sources/nhsjobs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "..", "fixtures");

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf-8");
}

describe("huntukvisasponsors", () => {
  it("flags obviously tech-related RSS items and leaves others alone", () => {
    expect(isLikelyTechRole({ title: "Senior Software Engineer at Foo" })).toBe(true);
    expect(isLikelyTechRole({ title: "DevOps Engineer" })).toBe(true);
    expect(isLikelyTechRole({ title: "Paediatric Clinical Healthcare Support Worker" })).toBe(false);
  });

  it("parses the RSS feed into items with title/link", async () => {
    const xml = loadFixture("hunt-uk-visa-sponsors-feed.xml");
    const parser = new Parser();
    const feed = await parser.parseString(xml);
    expect(feed.items.length).toBeGreaterThan(0);
    expect(feed.items[0]!.title).toBeTruthy();
    expect(feed.items[0]!.link).toContain("huntukvisasponsors.com/job/");
  });

  it("maps a detail page's JobPosting JSON-LD into a clean RawJob", () => {
    const html = loadFixture("hunt-uk-visa-sponsors-job.html");
    const job = mapHuntUkDetailPage(html, "https://huntukvisasponsors.com/job/director-ai-machine-learning-d3t5voe8s90n");
    expect(job).toBeDefined();
    expect(job!.title).toBe("Director, AI & Machine Learning");
    expect(job!.employerRaw).toBe("Finastra International Limited");
    expect(job!.location).toContain("London");
    expect(job!.description).toBeDefined();
    expect(job!.description).not.toContain("<p>");
    expect(job!.postedAt).toBe("2026-11-04T23:14:00Z");
  });

  it("returns undefined for a page with no JobPosting JSON-LD", () => {
    const job = mapHuntUkDetailPage("<html><body>not a job page</body></html>", "https://example.com/x");
    expect(job).toBeUndefined();
  });
});

describe("jobsacuk", () => {
  it("parses search result cards with title, employer, location, salary", () => {
    const html = loadFixture("jobsacuk-search.html");
    const now = new Date("2026-11-04T12:00:00.000Z");
    const jobs = parseJobsAcUkCards(html, now);
    expect(jobs.length).toBeGreaterThan(0);

    const first = jobs[0]!;
    expect(first.title).toBe("Software Engineer");
    expect(first.employerRaw).toBe("The University of Edinburgh");
    expect(first.location).toContain("Edinburgh");
    expect(first.salaryText).toContain("£41,064");
    expect(first.url).toContain("jobs.ac.uk/job/");
  });

  it("resolves a day/month date against the reference year, rolling back if it would be far in the future", () => {
    const html = loadFixture("jobsacuk-search.html");
    const now = new Date("2026-11-04T12:00:00.000Z");
    const jobs = parseJobsAcUkCards(html, now);
    expect(jobs[0]!.postedAt).toContain("2026-10-22");
  });
});

describe("nhsjobs", () => {
  it("parses search result cards with employer separated from location", () => {
    const html = loadFixture("nhsjobs-search.html");
    const jobs = parseNhsCards(html);
    expect(jobs.length).toBeGreaterThan(0);

    const first = jobs[0]!;
    expect(first.title).toBe("Development Consultant (Lead Software Developer)");
    expect(first.employerRaw).toBe("Portsmouth Hospitals University NHS Trust");
    expect(first.location).toContain("Portsmouth");
    expect(first.salaryText).toContain("£57,528");
    expect(first.postedAt).toContain("2026-10-26");
    expect(first.closingAt).toContain("2026-11-12");
  });
});
