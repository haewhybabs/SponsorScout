import type { Job, RawJob } from "../types.js";
import { normaliseName } from "../sponsors/match.js";
import { computeJobId } from "./dedupe.js";

export type NormalisedJob = Pick<
  Job,
  | "id"
  | "source"
  | "externalId"
  | "title"
  | "employerRaw"
  | "employerNormalised"
  | "location"
  | "remoteType"
  | "salaryText"
  | "isContract"
  | "url"
  | "description"
  | "postedAt"
  | "closingAt"
  | "firstSeenAt"
  | "lastSeenAt"
>;

export function normaliseRawJob(raw: RawJob, source: string, nowIso: string): NormalisedJob {
  return {
    id: computeJobId(source, raw.externalId, raw.url),
    source,
    externalId: raw.externalId,
    title: raw.title.trim(),
    employerRaw: raw.employerRaw.trim(),
    employerNormalised: normaliseName(raw.employerRaw),
    location: raw.location?.trim() || "Unknown",
    remoteType: raw.remoteType ?? "unknown",
    salaryText: raw.salaryText,
    isContract: raw.isContract ?? false,
    url: raw.url,
    description: raw.description,
    postedAt: raw.postedAt,
    closingAt: raw.closingAt,
    firstSeenAt: nowIso,
    lastSeenAt: nowIso,
  };
}
