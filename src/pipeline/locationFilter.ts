/**
 * Skilled Worker visa sponsorship is for roles actually based in the UK - a job at a
 * UK-licensed sponsor whose office is in Hyderabad, Sunnyvale, or Berlin isn't eligible,
 * even though the employer legitimately matches the sponsor register. ATS company feeds
 * return every office a company has, not just the UK ones, so this has to be filtered
 * centrally rather than per-source.
 *
 * Rule, in priority order:
 *   1. A high-confidence UK signal (the country name, "UK"/"GB", a UK postcode, or a
 *      constituent country name) wins regardless of anything else in the string - this
 *      handles multi-location listings like "Berlin, Germany; London, United Kingdom".
 *   2. A US state abbreviation (", MA", ", CA", ...) is unambiguous and beats a same-named
 *      UK city - "Cambridge, MA" is Massachusetts, not Cambridge, England.
 *   3. A UK city name on its own (lower confidence than #1, since city names can collide
 *      with places elsewhere - hence #2 running first) passes.
 *   4. A clearly-named non-UK country/city excludes it.
 *   5. Anything else ambiguous (e.g. just "Remote", or empty) passes - we'd rather show
 *      an uncertain one than hide a real UK role.
 */

const UK_STRONG_PATTERN = /united kingdom|\buk\b|\bgb\b|\bengland\b|\bscotland\b|\bwales\b|northern ireland/i;

// Deliberately no bare "york" (collides with "New York") - "New York" is excluded via
// NON_UK_PATTERN below, so if we need York, England specifically, match it unambiguously.
const UK_CITY_PATTERN =
  /\blondon\b|manchester|birmingham|bristol|cambridge|\bleeds\b|liverpool|sheffield|nottingham|\bderby\b|leicester|edinburgh|glasgow|cardiff|belfast|\boxford\b|exeter|newcastle|southampton|portsmouth|coventry|\breading\b|gloucester|harwell|ashford|york, england|york, uk|warwick|norwich|swansea|aberdeen|brighton|chesterfield/i;

// A UK postcode (e.g. "TN25 4BY", "SW17 0RB", "EX2 5SE") is a strong positive signal on its own.
const UK_POSTCODE_PATTERN = /\b[A-Z]{1,2}\d[A-Z0-9]?\s?\d[A-Z]{2}\b/;

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC",
]);

function hasUsStateSuffix(text: string): boolean {
  const matches = text.match(/,\s*([A-Z]{2})\b/g);
  if (!matches) return false;
  return matches.some((m) => US_STATE_CODES.has(m.replace(/,\s*/, "")));
}

const NON_UK_PATTERN =
  /\bindia\b|united states|\busa\b|\bu\.s\.a?\.?\b|\bus\b|canada|germany|france|\bspain\b|\bitaly\b|netherlands|belgium|switzerland|austria|poland|portugal|czechia|czech republic|hungary|romania|bulgaria|lithuania|latvia|estonia|ireland|denmark|norway|sweden|finland|greece|cyprus|serbia|ukraine|israel|\bjapan\b|\bchina\b|taiwan|singapore|australia|brazil|\bmexico\b|south africa|hyderabad|bengaluru|bangalore|gurugram|\bdelhi\b|\bmumbai\b|\bpune\b|dublin|berlin|amsterdam|\bparis\b|madrid|barcelona|lisbon|warsaw|gda[nń]sk|prague|budapest|vienna|z[üu]rich|stockholm|copenhagen|\boslo\b|helsinki|tel aviv|sydney|melbourne|tokyo|hong kong|\bkyiv\b|atlanta|austin|denver|san francisco|new york|seattle|chicago|boston|sunnyvale|phoenix|dallas|detroit|jacksonville|philadelphia|\bmiami\b|el paso|las vegas|los angeles|san diego|tucson|^europe$|eu remote/i;

export function isUkLocation(location: string): boolean {
  const text = location.trim();
  if (!text) return true;

  if (UK_STRONG_PATTERN.test(text) || UK_POSTCODE_PATTERN.test(text)) return true;
  if (hasUsStateSuffix(text)) return false;
  if (UK_CITY_PATTERN.test(text)) return true;
  if (NON_UK_PATTERN.test(text)) return false;
  return true;
}
