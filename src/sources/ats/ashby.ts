import type { FetchContext, RawJob, RemoteType, Source } from "../../types.js";
import { politeFetchJsonCached } from "../../net.js";

type AshbyJob = {
  id: string;
  title: string;
  location?: string;
  jobUrl: string;
  publishedAt?: string;
  isRemote?: boolean | null;
  workplaceType?: string | null;
  descriptionPlain?: string;
  compensation?: { compensationTierSummary?: string | null };
};

type AshbyResponse = { jobs: AshbyJob[] };

function normaliseWorkplaceType(wt?: string | null, isRemote?: boolean | null): RemoteType {
  if (wt) {
    const v = wt.toLowerCase();
    if (v.includes("remote")) return "remote";
    if (v.includes("hybrid")) return "hybrid";
    if (v.includes("onsite") || v.includes("on-site") || v.includes("in-person")) return "onsite";
  }
  if (isRemote) return "remote";
  return "unknown";
}

export function mapAshbyJob(job: AshbyJob, companyName: string): RawJob {
  return {
    externalId: job.id,
    title: job.title,
    employerRaw: companyName,
    location: job.location,
    remoteType: normaliseWorkplaceType(job.workplaceType, job.isRemote),
    salaryText: job.compensation?.compensationTierSummary ?? undefined,
    url: job.jobUrl,
    description: job.descriptionPlain,
    postedAt: job.publishedAt,
  };
}

export function createAshbySource(companyName: string, slug: string): Source {
  return {
    id: `ashby:${slug}`,
    async fetchJobs(ctx: FetchContext): Promise<RawJob[]> {
      const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`;
      const data = await politeFetchJsonCached<AshbyResponse>(url, ctx, `ashby-${slug}`);
      return data.jobs.map((j) => mapAshbyJob(j, companyName));
    },
  };
}
