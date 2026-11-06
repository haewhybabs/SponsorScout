import { describe, it, expect } from "vitest";
import { parseSalary, classifySalary } from "../src/pipeline/salary.js";

describe("parseSalary", () => {
  const cases: Array<[string | undefined, { salaryMin?: number; salaryMax?: number; isContract: boolean }]> = [
    ["£54,000 to £60,000 a year", { salaryMin: 54000, salaryMax: 60000, isContract: false }],
    ["£54k–£60k", { salaryMin: 54000, salaryMax: 60000, isContract: false }],
    ["£54,000 - £60,000 per annum", { salaryMin: 54000, salaryMax: 60000, isContract: false }],
    ["Up to £70,000", { salaryMax: 70000, isContract: false }],
    ["From £55,000", { salaryMin: 55000, isContract: false }],
    ["£450/day", { salaryMin: 99000, salaryMax: 99000, isContract: true }],
    ["£400 - £500 a day", { salaryMin: 88000, salaryMax: 110000, isContract: true }],
    ["£50/hour", { salaryMin: 97500, salaryMax: 97500, isContract: false }],
    ["£25.50 per hour", { salaryMin: 49725, salaryMax: 49725, isContract: false }],
    ["Competitive", { isContract: false }],
    ["Negotiable", { isContract: false }],
    ["DOE", { isContract: false }],
    ["£54,000 - £60,000 + London weighting", { salaryMin: 54000, salaryMax: 60000, isContract: false }],
    ["£60,000", { salaryMin: 60000, salaryMax: 60000, isContract: false }],
    ["£54k to £60k", { salaryMin: 54000, salaryMax: 60000, isContract: false }],
    ["£54,000-£60,000", { salaryMin: 54000, salaryMax: 60000, isContract: false }],
    ["up to £65k", { salaryMax: 65000, isContract: false }],
    ["From £50,271", { salaryMin: 50271, isContract: false }],
    ["£50k", { salaryMin: 50000, salaryMax: 50000, isContract: false }],
    ["Salary: £58,000", { salaryMin: 58000, salaryMax: 58000, isContract: false }],
    ["£54,000–£60,000 DOE", { salaryMin: 54000, salaryMax: 60000, isContract: false }],
    ["£60,000 plus bonus", { salaryMin: 60000, salaryMax: 60000, isContract: false }],
    [undefined, { isContract: false }],
    ["", { isContract: false }],
    ["35608 - 46049 GBP / Year", { salaryMin: 35608, salaryMax: 46049, isContract: false }],
    ["58000 GBP / Year", { salaryMin: 58000, salaryMax: 58000, isContract: false }],
    ["Not Specified", { isContract: false }],
  ];

  for (const [input, expected] of cases) {
    it(`parses ${JSON.stringify(input)}`, () => {
      expect(parseSalary(input)).toEqual(expected);
    });
  }
});

describe("classifySalary", () => {
  const floor = 50271;
  const target = 55000;

  it("is unknown with no numbers", () => {
    expect(classifySalary(undefined, undefined, floor, target)).toBe("unknown");
  });

  it("is below when max is under the floor", () => {
    expect(classifySalary(40000, 48000, floor, target)).toBe("below");
  });

  it("is strong when min >= floor and max >= target", () => {
    expect(classifySalary(55000, 65000, floor, target)).toBe("strong");
  });

  it("is strong when min is unknown but max clears the 60k ceiling", () => {
    expect(classifySalary(undefined, 70000, floor, target)).toBe("strong");
  });

  it("is borderline when min is unknown and max is between target and the ceiling", () => {
    expect(classifySalary(undefined, 56000, floor, target)).toBe("borderline");
  });

  it("is borderline when the range straddles floor and target", () => {
    expect(classifySalary(48000, 52000, floor, target)).toBe("borderline");
  });
});
