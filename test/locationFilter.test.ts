import { describe, it, expect } from "vitest";
import { isUkLocation } from "../src/pipeline/locationFilter.js";

describe("isUkLocation", () => {
  it("passes clear UK locations", () => {
    expect(isUkLocation("London, United Kingdom")).toBe(true);
    expect(isUkLocation("London, UK")).toBe(true);
    expect(isUkLocation("Cambridge, England, United Kingdom")).toBe(true);
    expect(isUkLocation("Glasgow, Scotland, United Kingdom")).toBe(true);
    expect(isUkLocation("Bristol, GB")).toBe(true);
    expect(isUkLocation("London Area, United Kingdom")).toBe(true);
    expect(isUkLocation("London or remote within the UK")).toBe(true);
  });

  it("passes bare UK postcodes with no country text", () => {
    expect(isUkLocation("Ashford TN25 4BY")).toBe(true);
    expect(isUkLocation("Birmingham B13 8JL")).toBe(true);
    expect(isUkLocation("Exeter EX2 5SE")).toBe(true);
    expect(isUkLocation("Cardiff CF15 7QZ")).toBe(true);
  });

  it("passes a multi-location listing that includes the UK as one option", () => {
    expect(isUkLocation("Berlin, Germany; London, United Kingdom")).toBe(true);
    expect(
      isUkLocation(
        "Berlin, Germany; Bulgaria; India, Bengaluru; India, Delhi NCR; India, Hyderabad; Lithuania; Serbia; United Kingdom",
      ),
    ).toBe(true);
  });

  it("rejects clear non-UK locations even when the employer is a UK sponsor", () => {
    expect(isUkLocation("Hyderabad, India")).toBe(false);
    expect(isUkLocation("Bengaluru, India")).toBe(false);
    expect(isUkLocation("Sunnyvale, California USA")).toBe(false);
    expect(isUkLocation("Berlin, BE, DE, Berlin, Germany")).toBe(false);
    expect(isUkLocation("Amsterdam, Amsterdam, Netherlands")).toBe(false);
    expect(isUkLocation("Dublin, D, IE, Dublin, Ireland")).toBe(false);
    expect(isUkLocation("EE, Tallin, Tallinn, Estonia")).toBe(false);
    expect(isUkLocation("Lisbon, Portugal")).toBe(false);
    expect(isUkLocation("Canada")).toBe(false);
    expect(isUkLocation("Herzliya, Israel")).toBe(false);
  });

  it("does not let 'New York' false-positive-match on bare 'york' (regression)", () => {
    expect(isUkLocation("New York, United States")).toBe(false);
    expect(isUkLocation("United States, New York, New York City")).toBe(false);
  });

  it("does not let a US state abbreviation false-positive-match a same-named UK city", () => {
    expect(isUkLocation("Cambridge, MA")).toBe(false);
    expect(isUkLocation("Cambridge")).toBe(true);
    expect(isUkLocation("Cambridge, England, United Kingdom")).toBe(true);
    expect(isUkLocation("Birmingham, AL")).toBe(false);
    expect(isUkLocation("Birmingham, United Kingdom")).toBe(true);
  });

  it("gives ambiguous/unknown locations the benefit of the doubt", () => {
    expect(isUkLocation("Remote")).toBe(true);
    expect(isUkLocation("")).toBe(true);
    expect(isUkLocation("Hybrid")).toBe(true);
  });
});
