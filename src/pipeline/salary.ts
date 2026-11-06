import type { SalaryClass } from "../types.js";

export type ParsedSalary = {
  salaryMin?: number;
  salaryMax?: number;
  isContract: boolean;
};

const DAY_RATE_PATTERN = /\bper day\b|\/\s?day\b|\ba day\b|\bday rate\b/i;
const HOURLY_PATTERN = /\bper hour\b|\/\s?hr\b|\/\s?hour\b|\ban hour\b|\bhourly\b/i;
const UP_TO_PATTERN = /\bup to\b/i;
const FROM_PATTERN = /\bfrom\b/i;

const AMOUNT_PATTERN = /£\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s?(k)?/gi;

// Some UK institutional postings (e.g. academic job boards) write "35608 - 46049 GBP / Year"
// instead of using a £ symbol - only used as a fallback when no £-prefixed amount is found,
// and only when "GBP" actually appears, so we don't start treating arbitrary numbers as salary.
const GBP_SUFFIX_MARKER = /\bgbp\b/i;
const BARE_NUMBER_PATTERN = /\b(\d{4,6})\b/g;

function extractAmounts(text: string): number[] {
  const amounts: number[] = [];
  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    let value = parseFloat(match[1]!.replace(/,/g, ""));
    if (match[2]) value *= 1000;
    amounts.push(value);
  }
  if (amounts.length === 0 && GBP_SUFFIX_MARKER.test(text)) {
    for (const match of text.matchAll(BARE_NUMBER_PATTERN)) {
      amounts.push(parseFloat(match[1]!));
    }
  }
  return amounts;
}

/** Parse free-text salary into annual GBP min/max. See SPEC.md §8 for the handled formats. */
export function parseSalary(salaryText: string | undefined): ParsedSalary {
  if (!salaryText || salaryText.trim().length === 0) return { isContract: false };

  const text = salaryText.trim();
  const isDayRate = DAY_RATE_PATTERN.test(text);
  const isHourly = HOURLY_PATTERN.test(text);

  const amounts = extractAmounts(text);
  if (amounts.length === 0) {
    return { isContract: isDayRate };
  }

  let min: number | undefined;
  let max: number | undefined;

  if (amounts.length === 1) {
    if (UP_TO_PATTERN.test(text)) {
      max = amounts[0];
    } else if (FROM_PATTERN.test(text)) {
      min = amounts[0];
    } else {
      min = amounts[0];
      max = amounts[0];
    }
  } else {
    min = Math.min(...amounts);
    max = Math.max(...amounts);
  }

  if (isDayRate) {
    min = min !== undefined ? Math.round(min * 220) : undefined;
    max = max !== undefined ? Math.round(max * 220) : undefined;
  } else if (isHourly) {
    min = min !== undefined ? Math.round(min * 1950) : undefined;
    max = max !== undefined ? Math.round(max * 1950) : undefined;
  }

  return { salaryMin: min, salaryMax: max, isContract: isDayRate };
}

/** Classify an annual salary range against the ILR floor and target. See SPEC.md §8. */
export function classifySalary(
  salaryMin: number | undefined,
  salaryMax: number | undefined,
  floor: number,
  target: number,
): SalaryClass {
  if (salaryMin === undefined && salaryMax === undefined) return "unknown";
  if (salaryMax !== undefined && salaryMax < floor) return "below";

  // Spec's worked example pairs a 55k target with a 60k unknown-min ceiling (+5k margin).
  const strongUnknownMinCeiling = target + 5000;
  const isStrong =
    salaryMax !== undefined &&
    salaryMax >= target &&
    (salaryMin !== undefined ? salaryMin >= floor : salaryMax >= strongUnknownMinCeiling);
  if (isStrong) return "strong";

  return "borderline";
}
