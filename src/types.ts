export type RemoteType = "remote" | "hybrid" | "onsite" | "unknown";

export type SponsorStatus = "likely" | "unclear" | "no";

export type SponsorConfidence = "high" | "medium" | "none";

export type SalaryClass = "strong" | "borderline" | "unknown" | "below";

/** User-set triage state, independent of whether the job has been shown in a digest yet. */
export type JobUiStatus = "new" | "applied" | "ignored";

/** A job as returned by a source, before normalisation. */
export type RawJob = {
  externalId?: string;
  title: string;
  employerRaw: string;
  location?: string;
  remoteType?: RemoteType;
  salaryText?: string;
  url: string;
  description?: string;
  postedAt?: string;
  closingAt?: string;
  isContract?: boolean;
};

/** A job after the full normalise -> sponsor -> salary -> score pipeline. */
export type Job = {
  id: string;
  source: string;
  externalId?: string;
  title: string;
  employerRaw: string;
  employerNormalised: string;
  location: string;
  remoteType: RemoteType;
  salaryMin?: number;
  salaryMax?: number;
  salaryText?: string;
  isContract: boolean;
  url: string;
  description?: string;
  postedAt?: string;
  closingAt?: string;
  firstSeenAt: string;
  lastSeenAt: string;

  sponsorStatus: SponsorStatus;
  sponsorMatchName?: string;
  sponsorRating?: string;
  sponsorConfidence: SponsorConfidence;

  salaryClass: SalaryClass;

  score: number;
  excludedReason?: string;

  status: JobUiStatus;
};

export type SponsorRecord = {
  organisationName: string;
  normalisedName: string;
  town?: string;
  county?: string;
  typeRating?: string;
  route: string;
  importedAt: string;
};

export type SourceStatus = "ok" | "failed" | "disabled";

export type RunSourceResult = {
  sourceId: string;
  status: SourceStatus;
  count: number;
  error?: string;
  durationMs: number;
};

export type FetchContext = {
  userAgent: string;
  cacheDir: string;
  timeoutMs: number;
  retries: number;
  minIntervalMsPerHost: number;
  log: (msg: string) => void;
};

export interface Source {
  id: string;
  fetchJobs(ctx: FetchContext): Promise<RawJob[]>;
}
