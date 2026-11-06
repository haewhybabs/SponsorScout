import { describe, it, expect } from "vitest";
import { isSoftwareRoleTitle } from "../src/pipeline/roleFilter.js";
import { loadProfile } from "../src/config.js";

const { roleFilter } = loadProfile();
const passes = (title: string) => isSoftwareRoleTitle(title, roleFilter);

describe("isSoftwareRoleTitle", () => {
  it("passes clear software titles", () => {
    expect(passes("Senior Software Engineer")).toBe(true);
    expect(passes("Backend Engineer")).toBe(true);
    expect(passes("iOS Developer")).toBe(true);
    expect(passes("DevOps Engineer")).toBe(true);
    expect(passes("Staff Engineer")).toBe(true);
    expect(passes("Engineering Manager, Connectivity - London")).toBe(true);
    expect(passes("Lead Systems Engineer")).toBe(true);
    expect(passes("Research Software Engineer")).toBe(true);
  });

  it("passes 'X Engineer' titles where X is a tech qualifier, even without the word 'software'", () => {
    expect(passes("React Engineer")).toBe(true);
    expect(passes("Senior Data Platform Engineer")).toBe(true);
    expect(passes("Site Reliability Engineer")).toBe(true);
  });

  it("rejects non-software 'Engineer' titles that job boards mix into IT/tech categories", () => {
    expect(passes("Materials Engineer")).toBe(false);
    expect(passes("Project Engineer Specialist")).toBe(false);
    expect(passes("PAINT LAUNCH ENGINEER - SVO")).toBe(false);
    expect(passes("Senior Performance Standards Engineer (Water)")).toBe(false);
    expect(passes("ICP Commissioning Engineer")).toBe(false);
  });

  it("rejects non-engineering roles entirely", () => {
    expect(passes("Business Analyst")).toBe(false);
    expect(passes("Senior Product Manager - Non Clinical")).toBe(false);
    expect(passes("Recruitment Consultant")).toBe(false);
    expect(passes("Key Account Executive")).toBe(false);
    expect(passes("Internal Communications Specialist")).toBe(false);
  });
});
