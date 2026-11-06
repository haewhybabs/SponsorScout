import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ScoutDb } from "../src/db.js";
import type { Job } from "../src/types.js";

function makeJob(overrides: Partial<Job>): Job {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    source: "greenhouse:monzo",
    title: "Senior Software Engineer",
    employerRaw: "Monzo",
    employerNormalised: "monzo",
    location: "London",
    remoteType: "hybrid",
    isContract: false,
    url: `https://example.com/${Math.random()}`,
    firstSeenAt: "2026-11-05T06:30:00.000Z",
    lastSeenAt: "2026-11-05T06:30:00.000Z",
    sponsorStatus: "likely",
    sponsorConfidence: "high",
    salaryClass: "strong",
    score: 10,
    status: "new",
    ...overrides,
  };
}

describe("ScoutDb pagination and category filtering", () => {
  let dir: string;
  let db: ScoutDb;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "sponsorscout-test-"));
    db = new ScoutDb(path.join(dir, "test.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("paginates with limit/offset and countJobsFiltered matches the full set", () => {
    for (let i = 0; i < 30; i++) {
      db.upsertJob(makeJob({ id: `job-${i}`, score: i }));
    }
    const page1 = db.getJobsFiltered({ limit: 10, offset: 0 });
    const page2 = db.getJobsFiltered({ limit: 10, offset: 10 });
    expect(page1).toHaveLength(10);
    expect(page2).toHaveLength(10);
    expect(page1[0]!.id).not.toBe(page2[0]!.id);
    expect(db.countJobsFiltered({})).toBe(30);
  });

  it("filters by category: company excludes nhs/visaBoard/university sources", () => {
    db.upsertJob(makeJob({ id: "a", source: "greenhouse:monzo" }));
    db.upsertJob(makeJob({ id: "b", source: "lever:zopa" }));
    db.upsertJob(makeJob({ id: "c", source: "nhsjobs" }));
    db.upsertJob(makeJob({ id: "d", source: "huntukvisasponsors" }));
    db.upsertJob(makeJob({ id: "e", source: "landedjobs" }));
    db.upsertJob(makeJob({ id: "f", source: "jobsacuk" }));

    expect(db.countJobsFiltered({ category: "company" })).toBe(2);
    expect(db.countJobsFiltered({ category: "nhs" })).toBe(1);
    expect(db.countJobsFiltered({ category: "visaBoard" })).toBe(2);
    expect(db.countJobsFiltered({ category: "university" })).toBe(1);
  });

  it("countJobsFiltered respects the same filters as getJobsFiltered (not just the page)", () => {
    for (let i = 0; i < 5; i++) {
      db.upsertJob(makeJob({ id: `strong-${i}`, salaryClass: "strong" }));
    }
    for (let i = 0; i < 3; i++) {
      db.upsertJob(makeJob({ id: `below-${i}`, salaryClass: "below" }));
    }
    const page = db.getJobsFiltered({ salaryClass: "strong", limit: 2, offset: 0 });
    expect(page).toHaveLength(2);
    expect(db.countJobsFiltered({ salaryClass: "strong" })).toBe(5);
  });

  it("filters by postedSince, excluding jobs with no known posted date", () => {
    db.upsertJob(makeJob({ id: "recent", postedAt: "2026-11-01T00:00:00.000Z" }));
    db.upsertJob(makeJob({ id: "old", postedAt: "2025-01-01T00:00:00.000Z" }));
    db.upsertJob(makeJob({ id: "unknown", postedAt: undefined }));

    const recentOnly = db.getJobsFiltered({ postedSince: "2026-10-01T00:00:00.000Z" });
    expect(recentOnly.map((j) => j.id)).toEqual(["recent"]);
    expect(db.countJobsFiltered({ postedSince: "2026-10-01T00:00:00.000Z" })).toBe(1);
  });
});
