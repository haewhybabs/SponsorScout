import { describe, it, expect } from "vitest";
import { normaliseRawJob } from "../src/pipeline/normalise.js";
import type { RawJob } from "../src/types.js";

describe("normaliseRawJob", () => {
  const raw: RawJob = {
    externalId: "123",
    title: "  Senior Engineer  ",
    employerRaw: "Monzo",
    location: " London ",
    url: "https://job-boards.greenhouse.io/monzo/jobs/123",
    description: "Great role",
  };

  it("trims fields and fills in employerNormalised", () => {
    const job = normaliseRawJob(raw, "greenhouse:monzo", "2026-11-04T06:30:00.000Z");
    expect(job.title).toBe("Senior Engineer");
    expect(job.location).toBe("London");
    expect(job.employerNormalised).toBe("monzo");
    expect(job.source).toBe("greenhouse:monzo");
    expect(job.firstSeenAt).toBe("2026-11-04T06:30:00.000Z");
  });

  it("defaults missing location to 'Unknown' and remoteType to 'unknown'", () => {
    const job = normaliseRawJob({ ...raw, location: undefined }, "src", "2026-11-04T06:30:00.000Z");
    expect(job.location).toBe("Unknown");
    expect(job.remoteType).toBe("unknown");
  });

  it("produces the same id for the same external id regardless of URL query params", () => {
    const a = normaliseRawJob(raw, "greenhouse:monzo", "t");
    const b = normaliseRawJob({ ...raw, url: raw.url + "?gh_src=abc" }, "greenhouse:monzo", "t");
    expect(a.id).toBe(b.id);
  });
});
