export type SourceCategory = "company" | "nhs" | "visaBoard" | "university" | "publicSector";

// Single source of truth for which source ids belong to each non-default category.
// "company" is the fallback for anything not listed here (see sourceCategory below) -
// db.ts's SQL filter is built from this same map so the two can't drift apart.
export const CATEGORY_SOURCE_IDS: Partial<Record<SourceCategory, string[]>> = {
  nhs: ["nhsjobs"],
  visaBoard: ["huntukvisasponsors", "landedjobs", "nextleveljobs"],
  university: ["jobsacuk", "societyrse"],
  // Regulators/central bank etc. - legally separate from core Civil Service (not
  // subject to its nationality/security-clearance eligibility rule) and known to
  // sponsor, but distinct enough from a VC-backed company page to filter separately.
  publicSector: ["workday:fca", "workday:ofcom", "workday:neso"],
};

/** Group a source id (e.g. "greenhouse:monzo", "nhsjobs") into a broad category for UI filtering. */
export function sourceCategory(sourceId: string): SourceCategory {
  for (const [category, ids] of Object.entries(CATEGORY_SOURCE_IDS)) {
    if (ids.includes(sourceId)) return category as SourceCategory;
  }
  return "company";
}

export const SOURCE_CATEGORY_LABELS: Record<SourceCategory, string> = {
  company: "Company pages",
  nhs: "NHS",
  visaBoard: "Visa sponsorship platforms",
  university: "Universities",
  publicSector: "Regulators & public bodies",
};

export const SOURCE_CATEGORIES: SourceCategory[] = [
  "company",
  "nhs",
  "visaBoard",
  "university",
  "publicSector",
];
