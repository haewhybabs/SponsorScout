/**
 * Loose "is this even a tech role" filter used only to decide which job detail pages
 * are worth fetching from sources whose listing/feed doesn't already give us clean
 * employer/salary data. Final relevance is still decided by pipeline/score.ts against
 * the user's real profile - this just avoids spending requests on obviously-unrelated roles.
 */
export const TECH_TITLE_PATTERN =
  /software|developer|\bdev\b|engineer|programmer|full.?stack|front.?end|back.?end|devops|\bsre\b|platform engineer|data engineer|machine learning|\bai\b|cloud engineer|site reliability|golang|python|javascript|typescript|\breact\b|node\.js|kotlin|\.net developer|java developer|architect|technical lead|tech lead/i;
