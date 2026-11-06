import type { Job, RunSourceResult } from "../types.js";

export type ExcludedReason = "no sponsorship text" | "below salary" | "irrelevant";

export type DigestModel = {
  date: string;
  totalNew: number;
  strongCount: number;
  borderlineCount: number;
  unknownSalaryCount: number;
  sourcesFailedCount: number;
  strong: Job[];
  checkSalary: Job[];
  checkSponsor: Job[];
  excludedCounts: Record<ExcludedReason, number>;
  runResults: RunSourceResult[];
};

function excludedReasonFor(job: Job): ExcludedReason | undefined {
  if (job.excludedReason) return "irrelevant";
  if (job.sponsorStatus === "no") return "no sponsorship text";
  if (job.salaryClass === "below") return "below salary";
  return undefined;
}

/** Partition today's new jobs into the digest sections from SPEC.md §10. */
export function buildDigestModel(
  jobs: Job[],
  runResults: RunSourceResult[],
  date: string,
): DigestModel {
  const strong: Job[] = [];
  const checkSalary: Job[] = [];
  const checkSponsor: Job[] = [];
  const excludedCounts: Record<ExcludedReason, number> = {
    "no sponsorship text": 0,
    "below salary": 0,
    irrelevant: 0,
  };

  for (const job of jobs) {
    const reason = excludedReasonFor(job);
    if (reason) {
      excludedCounts[reason]++;
      continue;
    }
    if (job.sponsorStatus === "likely" && job.salaryClass === "strong") {
      strong.push(job);
    } else if (job.sponsorStatus === "likely") {
      checkSalary.push(job);
    } else {
      checkSponsor.push(job);
    }
  }

  const bySelf = (a: Job, b: Job) => b.score - a.score;
  strong.sort(bySelf);
  checkSalary.sort(bySelf);
  checkSponsor.sort(bySelf);

  return {
    date,
    totalNew: jobs.length,
    strongCount: jobs.filter((j) => j.salaryClass === "strong").length,
    borderlineCount: jobs.filter((j) => j.salaryClass === "borderline").length,
    unknownSalaryCount: jobs.filter((j) => j.salaryClass === "unknown").length,
    sourcesFailedCount: runResults.filter((r) => r.status === "failed").length,
    strong,
    checkSalary,
    checkSponsor,
    excludedCounts,
    runResults,
  };
}
