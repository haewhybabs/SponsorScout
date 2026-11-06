import { describe, it, expect } from "vitest";
import { buildDigestModel } from "../src/output/model.js";
import { renderMarkdown } from "../src/output/markdown.js";
import { renderHtml } from "../src/output/html.js";
import type { Job, RunSourceResult } from "../src/types.js";

function makeJob(overrides: Partial<Job>): Job {
  return {
    id: Math.random().toString(36).slice(2),
    source: "greenhouse:monzo",
    title: "Senior Software Engineer",
    employerRaw: "Monzo",
    employerNormalised: "monzo",
    location: "London",
    remoteType: "hybrid",
    isContract: false,
    url: "https://example.com/job",
    firstSeenAt: "2026-11-04T06:30:00.000Z",
    lastSeenAt: "2026-11-04T06:30:00.000Z",
    sponsorStatus: "likely",
    sponsorConfidence: "high",
    salaryClass: "strong",
    status: "new",
    score: 10,
    ...overrides,
  };
}

const runResults: RunSourceResult[] = [
  { sourceId: "greenhouse:monzo", status: "ok", count: 5, durationMs: 100 },
  { sourceId: "lever:zopa", status: "failed", count: 0, error: "timeout", durationMs: 100 },
];

describe("buildDigestModel", () => {
  it("partitions jobs into strong / check salary / check sponsor / excluded", () => {
    const jobs = [
      makeJob({ sponsorStatus: "likely", salaryClass: "strong", score: 20 }), // strong
      makeJob({ sponsorStatus: "likely", salaryClass: "borderline", score: 5 }), // check salary
      makeJob({ sponsorStatus: "unclear", salaryClass: "borderline", score: 3 }), // check sponsor
      makeJob({ sponsorStatus: "no", salaryClass: "strong" }), // excluded: no sponsorship text
      makeJob({ sponsorStatus: "likely", salaryClass: "below" }), // excluded: below salary
      makeJob({ sponsorStatus: "likely", salaryClass: "strong", excludedReason: "negative keyword in title: \"intern\"" }), // excluded: irrelevant
    ];

    const model = buildDigestModel(jobs, runResults, "2026-11-04");

    expect(model.totalNew).toBe(6);
    expect(model.strong).toHaveLength(1);
    expect(model.checkSalary).toHaveLength(1);
    expect(model.checkSponsor).toHaveLength(1);
    expect(model.excludedCounts["no sponsorship text"]).toBe(1);
    expect(model.excludedCounts["below salary"]).toBe(1);
    expect(model.excludedCounts.irrelevant).toBe(1);
    expect(model.sourcesFailedCount).toBe(1);
  });

  it("sorts each section by score descending", () => {
    const jobs = [
      makeJob({ sponsorStatus: "likely", salaryClass: "strong", score: 1 }),
      makeJob({ sponsorStatus: "likely", salaryClass: "strong", score: 9 }),
      makeJob({ sponsorStatus: "likely", salaryClass: "strong", score: 5 }),
    ];
    const model = buildDigestModel(jobs, [], "2026-11-04");
    expect(model.strong.map((j) => j.score)).toEqual([9, 5, 1]);
  });
});

describe("renderMarkdown / renderHtml", () => {
  const jobs = [makeJob({ sponsorMatchName: "Monzo Bank Ltd", sponsorRating: "Worker (A rating)" })];
  const model = buildDigestModel(jobs, runResults, "2026-11-04");

  it("markdown includes the summary line and a strong match card", () => {
    const md = renderMarkdown(model);
    expect(md).toContain("1 new today");
    expect(md).toContain("Senior Software Engineer");
    expect(md).toContain("Monzo Bank Ltd");
  });

  it("html escapes job fields and includes source health", () => {
    const html = renderHtml(model);
    expect(html).toContain("Senior Software Engineer");
    expect(html).toContain("lever:zopa");
    expect(html).toContain("timeout");
  });
});
