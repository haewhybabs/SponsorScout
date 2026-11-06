import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseListingHtml, parseDetailPage } from "../src/sources/societyrse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "..", "fixtures");

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf-8");
}

describe("societyrse listing parsing", () => {
  it("parses job cards from the AJAX response HTML", () => {
    const fixture = JSON.parse(loadFixture("societyrse-listing.json"));
    const candidates = parseListingHtml(fixture.html);
    expect(candidates.length).toBeGreaterThan(0);

    const first = candidates[0]!;
    expect(first.title).toBe("Senior Software Engineer, Computational Policy Lab");
    expect(first.employerRaw).toBe("Harvard Kennedy School");
    expect(first.location).toBe("Cambridge, MA");
    expect(first.url).toContain("society-rse.org/job/");
    expect(first.postedAt).toBe("2026-10-27");
  });

  it("parses the UK-based Cambridge job distinctly from the Cambridge, MA one", () => {
    const fixture = JSON.parse(loadFixture("societyrse-listing.json"));
    const candidates = parseListingHtml(fixture.html);
    const uk = candidates.find((c) => c.employerRaw.includes("Institute of Astronomy"));
    expect(uk).toBeDefined();
    expect(uk!.location).toBe("Cambridge");
    expect(uk!.title).toBe("Research Software Engineer");
  });

  it("parses closing dates", () => {
    const fixture = JSON.parse(loadFixture("societyrse-listing.json"));
    const candidates = parseListingHtml(fixture.html);
    const withDeadline = candidates.find((c) => c.closingAt);
    expect(withDeadline).toBeDefined();
  });
});

describe("societyrse detail page parsing", () => {
  it("extracts salary from the dedicated .salary element", () => {
    const html = loadFixture("societyrse-detail.html");
    const { salaryText } = parseDetailPage(html);
    expect(salaryText).toBe("35608 - 46049 GBP / Year");
  });

  it("extracts a plain-text description from .job_description", () => {
    const html = loadFixture("societyrse-detail.html");
    const { description } = parseDetailPage(html);
    expect(description).toBeDefined();
    expect(description).toContain("Institute of Astronomy");
    expect(description).not.toContain("<p>");
  });
});
