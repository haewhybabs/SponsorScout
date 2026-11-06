import type { FetchContext, RawJob, Source } from "../../types.js";
import { politeFetchJsonCached } from "../../net.js";
import { greenhouseContentToText } from "../htmlText.js";

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  first_published?: string;
  location?: { name?: string };
  content?: string;
  company_name?: string;
};

type GreenhouseResponse = { jobs: GreenhouseJob[] };

export function mapGreenhouseJob(job: GreenhouseJob, companyName: string): RawJob {
  return {
    externalId: String(job.id),
    title: job.title,
    employerRaw: job.company_name || companyName,
    location: job.location?.name,
    url: job.absolute_url,
    description: job.content ? greenhouseContentToText(job.content) : undefined,
    postedAt: job.first_published,
  };
}

export function createGreenhouseSource(companyName: string, slug: string): Source {
  return {
    id: `greenhouse:${slug}`,
    async fetchJobs(ctx: FetchContext): Promise<RawJob[]> {
      const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
      const data = await politeFetchJsonCached<GreenhouseResponse>(
        url,
        ctx,
        `greenhouse-${slug}`,
      );
      return data.jobs.map((j) => mapGreenhouseJob(j, companyName));
    },
  };
}
