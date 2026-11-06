import { describe, it, expect } from "vitest";
import { canonicalizeUrl, computeJobId } from "../src/pipeline/dedupe.js";

describe("canonicalizeUrl", () => {
  it("strips tracking params and trailing slash", () => {
    const a = canonicalizeUrl("https://example.com/jobs/123/?utm_source=linkedin&utm_medium=social");
    const b = canonicalizeUrl("https://example.com/jobs/123");
    expect(a).toBe(b);
  });

  it("strips the fragment", () => {
    const a = canonicalizeUrl("https://example.com/jobs/123#apply");
    const b = canonicalizeUrl("https://example.com/jobs/123");
    expect(a).toBe(b);
  });

  it("falls back to the trimmed raw string for an unparseable URL", () => {
    expect(canonicalizeUrl("  not a url  ")).toBe("not a url");
  });
});

describe("computeJobId", () => {
  it("is stable for the same source + external id", () => {
    const a = computeJobId("greenhouse:monzo", "123", "https://job-boards.greenhouse.io/monzo/jobs/123");
    const b = computeJobId("greenhouse:monzo", "123", "https://job-boards.greenhouse.io/monzo/jobs/123?utm_source=x");
    expect(a).toBe(b);
  });

  it("is stable across equivalent URLs when there is no external id", () => {
    const a = computeJobId("huntukvisasponsors", undefined, "https://example.com/jobs/123/?ref=home");
    const b = computeJobId("huntukvisasponsors", undefined, "https://example.com/jobs/123");
    expect(a).toBe(b);
  });

  it("differs for different external ids on the same source", () => {
    const a = computeJobId("greenhouse:monzo", "123", "https://x/123");
    const b = computeJobId("greenhouse:monzo", "456", "https://x/456");
    expect(a).not.toBe(b);
  });
});
