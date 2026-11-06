import Fuse from "fuse.js";
import type { SponsorRecord, SponsorConfidence } from "../types.js";

const SUFFIX_WORDS = new Set([
  "limited",
  "ltd",
  "plc",
  "llp",
  "uk",
  "group",
  "holdings",
]);

/** Split "X T/A Y" into its legal and trading-as parts. Most names have no T/A. */
export function splitTradingAs(raw: string): { legal: string; tradingAs?: string } {
  const match = raw.split(/\bt\/a\b/i);
  if (match.length >= 2) {
    return { legal: match[0]!.trim(), tradingAs: match.slice(1).join(" ").trim() };
  }
  return { legal: raw.trim() };
}

/** lowercase, strip punctuation, strip company-type suffix words, collapse whitespace. */
export function normaliseName(raw: string): string {
  let s = raw.toLowerCase();
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  const words = s.split(/\s+/).filter((w) => w.length > 0 && !SUFFIX_WORDS.has(w));
  return words.join(" ").trim();
}

/** All normalised name variants worth indexing/matching for a raw organisation/employer name. */
export function nameVariants(raw: string): string[] {
  const { legal, tradingAs } = splitTradingAs(raw);
  const variants = [normaliseName(legal)];
  if (tradingAs) variants.push(normaliseName(tradingAs));
  return [...new Set(variants.filter((v) => v.length > 0))];
}

export type MatchResult = {
  record?: SponsorRecord;
  confidence: SponsorConfidence;
};

const FUZZY_THRESHOLD = 0.3;

export class SponsorIndex {
  private readonly byExactName = new Map<string, SponsorRecord>();
  private readonly fuse: Fuse<SponsorRecord>;
  // A fuzzy search over 100k+ register rows isn't free, and a single run of the
  // pipeline calls match() once per job - often dozens of jobs share one employer
  // name, so cache the result per raw employer string within this index's lifetime.
  private readonly matchCache = new Map<string, MatchResult>();

  constructor(records: SponsorRecord[]) {
    for (const r of records) {
      if (!this.byExactName.has(r.normalisedName)) {
        this.byExactName.set(r.normalisedName, r);
      }
    }
    this.fuse = new Fuse(records, {
      keys: ["normalisedName"],
      includeScore: true,
      threshold: FUZZY_THRESHOLD,
      ignoreLocation: true,
      minMatchCharLength: 3,
    });
  }

  match(employerRaw: string): MatchResult {
    const cached = this.matchCache.get(employerRaw);
    if (cached) return cached;

    const result = this.matchUncached(employerRaw);
    this.matchCache.set(employerRaw, result);
    return result;
  }

  private matchUncached(employerRaw: string): MatchResult {
    const variants = nameVariants(employerRaw);

    for (const variant of variants) {
      const exact = this.byExactName.get(variant);
      if (exact) return { record: exact, confidence: "high" };
    }

    for (const variant of variants) {
      const results = this.fuse.search(variant);
      if (results.length > 0 && (results[0]!.score ?? 1) <= FUZZY_THRESHOLD) {
        return { record: results[0]!.item, confidence: "medium" };
      }
    }

    return { confidence: "none" };
  }
}
