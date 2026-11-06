import type { Profile } from "../config.js";
import type { RemoteType } from "../types.js";
import { isSoftwareRoleTitle } from "./roleFilter.js";
import { isUkLocation } from "./locationFilter.js";

export type ScoreResult = {
  score: number;
  excluded: boolean;
  excludedReason?: string;
};

/** Score = keyword hits in title (x3) + description (x1) + seniority bonus + location match - negatives.
 *  A hard negative keyword in the title excludes the job outright. See SPEC.md §9. */
export function scoreJob(
  title: string,
  description: string | undefined,
  location: string,
  remoteType: RemoteType,
  profile: Profile,
): ScoreResult {
  const titleLower = title.toLowerCase();
  const descLower = (description ?? "").toLowerCase();
  const locationLower = location.toLowerCase();

  if (!isSoftwareRoleTitle(title, profile.roleFilter)) {
    return { score: 0, excluded: true, excludedReason: "title doesn't look like a software engineering role" };
  }

  if (!isUkLocation(location)) {
    return { score: 0, excluded: true, excludedReason: `location doesn't look UK-based: "${location}"` };
  }

  const negativeInTitle = profile.keywords.negative.find((kw) => titleLower.includes(kw.toLowerCase()));
  if (negativeInTitle) {
    return { score: 0, excluded: true, excludedReason: `negative keyword in title: "${negativeInTitle}"` };
  }

  const {
    titleKeywordWeight,
    descriptionKeywordWeight,
    seniorityBonus,
    locationMatchBonus,
    negativeHitPenalty,
  } = profile.scoring;

  const positiveKeywords = [...profile.keywords.strong, ...profile.keywords.medium];

  let score = 0;
  for (const kw of positiveKeywords) {
    const kwLower = kw.toLowerCase();
    if (titleLower.includes(kwLower)) score += titleKeywordWeight;
    if (descLower.includes(kwLower)) score += descriptionKeywordWeight;
  }

  for (const kw of profile.keywords.negative) {
    if (descLower.includes(kw.toLowerCase())) score -= negativeHitPenalty;
  }

  const hasSeniorityMatch = profile.seniority.prefer.some((kw) => titleLower.includes(kw.toLowerCase()));
  if (hasSeniorityMatch) score += seniorityBonus;

  const locationMatches =
    (profile.locations.remote_ok && remoteType === "remote") ||
    profile.locations.include.some((loc) => locationLower.includes(loc.toLowerCase()));
  if (locationMatches) score += locationMatchBonus;

  return { score, excluded: false };
}
