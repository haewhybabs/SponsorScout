import type { SponsorConfidence, SponsorStatus } from "../types.js";

export type PhraseCheckResult = {
  hasNegative: boolean;
  matchedNegative?: string;
  hasPositive: boolean;
  matchedPositive?: string;
};

/** Scan text for negative/positive sponsorship phrases (case-insensitive). See SPEC.md §7.4. */
export function checkSponsorPhrases(
  text: string,
  negativePhrases: string[],
  positivePhrases: string[],
): PhraseCheckResult {
  const lower = text.toLowerCase();
  const matchedNegative = negativePhrases.find((p) => lower.includes(p.toLowerCase()));
  const matchedPositive = positivePhrases.find((p) => lower.includes(p.toLowerCase()));
  return {
    hasNegative: Boolean(matchedNegative),
    matchedNegative,
    hasPositive: Boolean(matchedPositive),
    matchedPositive,
  };
}

/** Combine register match confidence with the phrase check into a final sponsor status. See SPEC.md §7.5. */
export function determineSponsorStatus(
  registerConfidence: SponsorConfidence,
  phrases: PhraseCheckResult,
): SponsorStatus {
  if (phrases.hasNegative) return "no";
  if (registerConfidence === "high" || registerConfidence === "medium") return "likely";
  return "unclear";
}
