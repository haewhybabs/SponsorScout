import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mapGreenhouseJob } from "../src/sources/ats/greenhouse.js";
import { mapLeverJob } from "../src/sources/ats/lever.js";
import { mapAshbyJob } from "../src/sources/ats/ashby.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "..", "fixtures");

function loadFixture(name: string) {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), "utf-8"));
}

describe("greenhouse adapter", () => {
  it("normalises a job and decodes the double-encoded content field", () => {
    const fixture = loadFixture("greenhouse-monzo.json");
    const job = fixture.jobs[0];
    const raw = mapGreenhouseJob(job, "Monzo");

    expect(raw.externalId).toBe(String(job.id));
    expect(raw.title).toBe(job.title);
    expect(raw.employerRaw).toBe("Monzo");
    expect(raw.url).toBe(job.absolute_url);
    // content starts double-encoded ("&lt;div...") - description must be clean plain text
    expect(raw.description).toBeDefined();
    expect(raw.description).not.toContain("&lt;");
    expect(raw.description).not.toContain("<div");
  });
});

describe("lever adapter", () => {
  it("normalises a job", () => {
    const fixture = loadFixture("lever-zopa.json");
    const job = fixture[0];
    const raw = mapLeverJob(job, "Zopa");

    expect(raw.externalId).toBe(job.id);
    expect(raw.title).toBe(job.text);
    expect(raw.employerRaw).toBe("Zopa");
    expect(raw.url).toBe(job.hostedUrl);
    expect(raw.location).toBe(job.categories?.location);
    expect(raw.description).toBe(job.descriptionPlain);
  });

  it("maps workplaceType to a RemoteType", () => {
    const raw = mapLeverJob(
      {
        id: "1",
        text: "Engineer",
        hostedUrl: "https://jobs.lever.co/x/1",
        workplaceType: "hybrid",
      },
      "X",
    );
    expect(raw.remoteType).toBe("hybrid");
  });
});

describe("ashby adapter", () => {
  it("normalises a job", () => {
    const fixture = loadFixture("ashby-truelayer.json");
    const job = fixture.jobs[0];
    const raw = mapAshbyJob(job, "TrueLayer");

    expect(raw.externalId).toBe(job.id);
    expect(raw.title).toBe(job.title);
    expect(raw.employerRaw).toBe("TrueLayer");
    expect(raw.url).toBe(job.jobUrl);
    expect(raw.description).toBe(job.descriptionPlain);
  });

  it("uses compensationTierSummary as salaryText when present", () => {
    const raw = mapAshbyJob(
      {
        id: "1",
        title: "Engineer",
        jobUrl: "https://jobs.ashbyhq.com/x/1",
        compensation: { compensationTierSummary: "£60K – £75K" },
      },
      "X",
    );
    expect(raw.salaryText).toBe("£60K – £75K");
  });
});
