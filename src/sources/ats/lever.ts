import type { FetchContext, RawJob, RemoteType, Source } from "../../types.js";
import { politeFetchJsonCached } from "../../net.js";

type LeverJob = {
  id: string;
  text: string;
  hostedUrl: string;
  categories?: { location?: string; team?: string; commitment?: string };
  workplaceType?: string;
  descriptionPlain?: string;
  createdAt?: number;
};

function normaliseWorkplaceType(wt?: string): RemoteType {
  if (!wt) return "unknown";
  const v = wt.toLowerCase();
  if (v.includes("remote")) return "remote";
  if (v.includes("hybrid")) return "hybrid";
  if (v.includes("onsite") || v.includes("on-site")) return "onsite";
  return "unknown";
}

export function mapLeverJob(job: LeverJob, companyName: string): RawJob {
  return {
    externalId: job.id,
    title: job.text,
    employerRaw: companyName,
    location: job.categories?.location,
    remoteType: normaliseWorkplaceType(job.workplaceType),
    url: job.hostedUrl,
    description: job.descriptionPlain,
    postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
  };
}

export function createLeverSource(companyName: string, slug: string): Source {
  return {
    id: `lever:${slug}`,
    async fetchJobs(ctx: FetchContext): Promise<RawJob[]> {
      const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
      const jobs = await politeFetchJsonCached<LeverJob[]>(url, ctx, `lever-${slug}`);
      return jobs.map((j) => mapLeverJob(j, companyName));
    },
  };
}
