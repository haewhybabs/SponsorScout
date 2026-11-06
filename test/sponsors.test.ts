import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseRegisterCsv } from "../src/sponsors/register.js";
import { SponsorIndex, normaliseName, splitTradingAs, nameVariants } from "../src/sponsors/match.js";
import type { SponsorRecord } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, "..", "fixtures", "sponsor-register-sample.csv");

describe("normaliseName", () => {
  it("lowercases, strips punctuation and company suffixes", () => {
    expect(normaliseName("Monzo Bank Ltd")).toBe("monzo bank");
    expect(normaliseName("ANDigital Limited")).toBe("andigital");
    expect(normaliseName("Associated Newspapers Ltd")).toBe("associated newspapers");
  });

  it("collapses whitespace", () => {
    expect(normaliseName("  Foo   Bar  Ltd ")).toBe("foo bar");
  });
});

describe("splitTradingAs", () => {
  it("splits X T/A Y (case-insensitive)", () => {
    expect(splitTradingAs("Roofoods Ltd t/a Deliveroo")).toEqual({
      legal: "Roofoods Ltd",
      tradingAs: "Deliveroo",
    });
    expect(splitTradingAs("BRANOS OXFORD LTD T/A LILO")).toEqual({
      legal: "BRANOS OXFORD LTD",
      tradingAs: "LILO",
    });
  });

  it("leaves names with no T/A untouched", () => {
    expect(splitTradingAs("Monzo Bank Ltd")).toEqual({ legal: "Monzo Bank Ltd" });
  });
});

describe("nameVariants", () => {
  it("indexes both the legal and trading name for T/A organisations", () => {
    expect(nameVariants("Roofoods Ltd t/a Deliveroo")).toEqual(["roofoods", "deliveroo"]);
  });
});

describe("parseRegisterCsv", () => {
  let records: SponsorRecord[];

  beforeAll(() => {
    const csv = readFileSync(FIXTURE_PATH, "utf-8");
    records = parseRegisterCsv(csv, "2026-11-04T00:00:00.000Z");
  });

  it("keeps only Skilled Worker route rows", () => {
    expect(records.some((r) => r.organisationName === "Frontera Consulting UK Ltd")).toBe(false);
  });

  it("captures type & rating", () => {
    const akaal = records.find((r) => r.organisationName === "Akaal Transport Ltd");
    expect(akaal?.typeRating).toBe("Worker (B rating)");
  });

  it("indexes T/A organisations under both names", () => {
    const deliveroo = records.filter((r) => r.organisationName === "Roofoods Ltd t/a Deliveroo");
    const normalisedNames = deliveroo.map((r) => r.normalisedName);
    expect(normalisedNames).toContain("roofoods");
    expect(normalisedNames).toContain("deliveroo");
  });
});

describe("SponsorIndex.match", () => {
  let index: SponsorIndex;

  beforeAll(() => {
    const csv = readFileSync(FIXTURE_PATH, "utf-8");
    const records = parseRegisterCsv(csv, "2026-11-04T00:00:00.000Z");
    index = new SponsorIndex(records);
  });

  it("matches an exact normalised name with high confidence", () => {
    const result = index.match("Zopa Bank Limited");
    expect(result.confidence).toBe("high");
    expect(result.record?.organisationName).toBe("Zopa Bank Limited");
  });

  it("matches a trading name exactly (Deliveroo -> Roofoods Ltd t/a Deliveroo)", () => {
    const result = index.match("Deliveroo");
    expect(result.confidence).toBe("high");
    expect(result.record?.organisationName).toBe("Roofoods Ltd t/a Deliveroo");
  });

  it("fuzzy-matches a shortened employer name (Monzo -> Monzo Bank Ltd)", () => {
    const result = index.match("Monzo");
    expect(result.confidence).toBe("medium");
    expect(result.record?.organisationName).toBe("Monzo Bank Ltd");
  });

  it("fuzzy-matches AND Digital against ANDigital Limited", () => {
    const result = index.match("AND Digital");
    expect(result.confidence).toBe("medium");
    expect(result.record?.organisationName).toBe("ANDigital Limited");
  });

  it("does NOT match Daily Mail against Associated Newspapers Ltd (brand/parent mismatch)", () => {
    const result = index.match("Daily Mail");
    expect(result.confidence).toBe("none");
    expect(result.record).toBeUndefined();
  });

  it("returns none for an employer with no register presence", () => {
    const result = index.match("Some Totally Unknown Startup Ltd");
    expect(result.confidence).toBe("none");
  });
});
