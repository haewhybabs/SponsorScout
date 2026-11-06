import { describe, it, expect } from "vitest";
import { checkSponsorPhrases, determineSponsorStatus } from "../src/pipeline/sponsorText.js";
import { loadProfile } from "../src/config.js";

const profile = loadProfile();
const { negative, positive } = profile.sponsorPhrases;

describe("checkSponsorPhrases", () => {
  it("detects a negative phrase case-insensitively", () => {
    const result = checkSponsorPhrases("We are UNABLE TO SPONSOR this role.", negative, positive);
    expect(result.hasNegative).toBe(true);
    expect(result.matchedNegative).toBe("unable to sponsor");
  });

  it("detects a positive phrase", () => {
    const result = checkSponsorPhrases("Visa sponsorship available for this role.", negative, positive);
    expect(result.hasPositive).toBe(true);
  });

  it("reports neither when no phrase is present", () => {
    const result = checkSponsorPhrases("Great opportunity for a senior engineer.", negative, positive);
    expect(result.hasNegative).toBe(false);
    expect(result.hasPositive).toBe(false);
  });

  it("flags common negative phrases from the spec", () => {
    for (const phrase of [
      "no sponsorship",
      "cannot sponsor",
      "must have the right to work",
      "sponsorship is not available",
    ]) {
      expect(checkSponsorPhrases(`Note: ${phrase}.`, negative, positive).hasNegative).toBe(true);
    }
  });
});

describe("determineSponsorStatus", () => {
  it("is 'no' whenever a negative phrase is present, regardless of register match", () => {
    const phrases = { hasNegative: true, hasPositive: false };
    expect(determineSponsorStatus("high", phrases)).toBe("no");
    expect(determineSponsorStatus("none", phrases)).toBe("no");
  });

  it("is 'likely' when on the register (high or medium) with no negative phrase", () => {
    const phrases = { hasNegative: false, hasPositive: false };
    expect(determineSponsorStatus("high", phrases)).toBe("likely");
    expect(determineSponsorStatus("medium", phrases)).toBe("likely");
  });

  it("is 'unclear' when not on the register and no negative phrase", () => {
    const phrases = { hasNegative: false, hasPositive: false };
    expect(determineSponsorStatus("none", phrases)).toBe("unclear");
  });
});
