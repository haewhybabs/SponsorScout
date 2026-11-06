const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** "26 October 2026" -> ISO date */
export function parseUkLongDate(text: string): string | undefined {
  const m = text.trim().match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const monthIndex = MONTHS.indexOf(m[2]!.toLowerCase());
  const year = Number(m[3]);
  if (monthIndex === -1) return undefined;
  return new Date(Date.UTC(year, monthIndex, day)).toISOString();
}
