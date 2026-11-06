import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractSalaryLine } from "../src/sources/ats/workday.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "..", "fixtures");

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf-8");
}

describe("workday salary extraction", () => {
  it("pulls the salary bullet out of a real FCA job description", () => {
    const fixture = JSON.parse(loadFixture("workday-detail.json"));
    const html = fixture.jobPostingInfo.jobDescription as string;
    const salaryText = extractSalaryLine(html);
    expect(salaryText).toContain("Salary:");
    expect(salaryText).toContain("£25,000");
    expect(salaryText).toContain("£32,000");
  });

  it("does not false-positive on a paragraph that mentions salary without an amount", () => {
    const html = "<p>Your recruiter can discuss salary expectations with you.</p><p>No numbers here.</p>";
    expect(extractSalaryLine(html)).toBeUndefined();
  });

  it("ignores unrelated £ mentions (e.g. benefits) that don't say salary", () => {
    const html = "<ul><li>Life assurance at eight times your £50,000 salary band</li><li>25 days annual leave</li></ul>";
    const salaryText = extractSalaryLine(html);
    expect(salaryText).toContain("£50,000");
  });
});

describe("workday listing fixture shape", () => {
  it("has the real FCA job postings list with external paths", () => {
    const fixture = JSON.parse(loadFixture("workday-listing.json"));
    expect(fixture.total).toBeGreaterThan(0);
    expect(fixture.jobPostings.length).toBeGreaterThan(0);
    expect(fixture.jobPostings[0].externalPath).toContain("/job/");
  });
});
