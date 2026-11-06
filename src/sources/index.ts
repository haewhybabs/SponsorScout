import type { CompanyEntry, SourcesConfig } from "../config.js";
import type { Source } from "../types.js";
import { createGreenhouseSource } from "./ats/greenhouse.js";
import { createLeverSource } from "./ats/lever.js";
import { createAshbySource } from "./ats/ashby.js";
import { createWorkdaySource } from "./ats/workday.js";
import { huntUkVisaSponsorsSource } from "./huntukvisasponsors.js";
import { jobsAcUkSource } from "./jobsacuk.js";
import { nhsJobsSource } from "./nhsjobs.js";
import { landedJobsSource } from "./landedjobs.js";
import { nextLevelJobsSource } from "./nextleveljobs.js";
import { societyRseSource } from "./societyrse.js";

/** Build the list of enabled ATS sources from companies.yaml. */
export function buildAtsSources(companies: CompanyEntry[]): Source[] {
  return companies.map((c) => {
    switch (c.ats) {
      case "greenhouse":
        return createGreenhouseSource(c.name, c.slug);
      case "lever":
        return createLeverSource(c.name, c.slug);
      case "ashby":
        return createAshbySource(c.name, c.slug);
      case "workday":
        return createWorkdaySource(c.name, c.slug, c.searchTerms);
      case "workable":
      case "smartrecruiters":
      case "teamtailor":
        throw new Error(
          `ATS adapter "${c.ats}" for company "${c.name}" is not implemented yet (Phase 2).`,
        );
    }
  });
}

/** Build the list of enabled job-board sources (aggregators, not single companies). */
export function buildJobBoardSources(sources: SourcesConfig["sources"]): Source[] {
  const boards: Source[] = [];
  if (sources.huntUkVisaSponsors.enabled) boards.push(huntUkVisaSponsorsSource);
  if (sources.jobsAcUk.enabled) boards.push(jobsAcUkSource);
  if (sources.nhsJobs.enabled) boards.push(nhsJobsSource);
  if (sources.landedJobs.enabled) boards.push(landedJobsSource);
  if (sources.nextLevelJobs.enabled) boards.push(nextLevelJobsSource);
  if (sources.societyRse.enabled) boards.push(societyRseSource);
  return boards;
}
