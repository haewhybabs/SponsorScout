import { describe, it, expect } from "vitest";
import { scoreJob } from "../src/pipeline/score.js";
import { loadProfile } from "../src/config.js";

const profile = loadProfile();

describe("scoreJob", () => {
  it("excludes a job with a hard negative keyword in the title", () => {
    const result = scoreJob("Graduate Software Engineer", "", "London", "onsite", profile);
    expect(result.excluded).toBe(true);
    expect(result.excludedReason).toContain("graduate");
  });

  it("does not exclude on a negative keyword only in the description", () => {
    const result = scoreJob("Senior Software Engineer", "Experience with Salesforce a plus.", "London", "onsite", profile);
    expect(result.excluded).toBe(false);
  });

  it("weights title keyword hits higher than description hits", () => {
    const titleHit = scoreJob("Senior React Engineer", "", "London", "onsite", profile);
    const descHit = scoreJob("Senior Engineer", "We use React here.", "London", "onsite", profile);
    expect(titleHit.score).toBeGreaterThan(descHit.score);
  });

  it("adds a seniority bonus for preferred seniority words in the title", () => {
    const senior = scoreJob("Senior Software Engineer", "", "Nowhere", "unknown", profile);
    const junior = scoreJob("Software Engineer", "", "Nowhere", "unknown", profile);
    expect(senior.score).toBeGreaterThan(junior.score);
  });

  it("adds a location bonus for a remote job when remote_ok is true", () => {
    const remote = scoreJob("Software Engineer", "", "Anywhere", "remote", profile);
    const unknownLoc = scoreJob("Software Engineer", "", "Anywhere", "unknown", profile);
    expect(remote.score).toBeGreaterThan(unknownLoc.score);
  });

  it("adds a location bonus for an included UK city", () => {
    const london = scoreJob("Software Engineer", "", "London, UK", "onsite", profile);
    const elsewhere = scoreJob("Software Engineer", "", "Antarctica", "onsite", profile);
    expect(london.score).toBeGreaterThan(elsewhere.score);
  });

  it("subtracts for a negative keyword found in the description", () => {
    const clean = scoreJob("Senior Software Engineer", "Great team.", "London", "onsite", profile);
    const withNegative = scoreJob("Senior Software Engineer", "Must hold SC clearance.", "London", "onsite", profile);
    expect(withNegative.score).toBeLessThan(clean.score);
  });

  it("excludes a role whose title doesn't look like software engineering", () => {
    const result = scoreJob("Business Analyst", "", "London", "onsite", profile);
    expect(result.excluded).toBe(true);
    expect(result.excludedReason).toContain("software engineering role");
  });

  it("excludes a generic non-software 'Engineer' title", () => {
    const result = scoreJob("Materials Engineer", "", "London", "onsite", profile);
    expect(result.excluded).toBe(true);
  });

  it("excludes a software role based at a non-UK office, even at a UK-sponsor employer", () => {
    const result = scoreJob("Senior Software Engineer", "", "Hyderabad, India", "onsite", profile);
    expect(result.excluded).toBe(true);
    expect(result.excludedReason).toContain("doesn't look UK-based");
  });
});
