import path from "node:path";
import type { Logger } from "pino";

import type { loadConfig } from "./config.js";
import { ScoutDb } from "./db.js";
import { fetchAndParseRegister } from "./sponsors/register.js";
import { SponsorIndex } from "./sponsors/match.js";
import { buildAtsSources, buildJobBoardSources } from "./sources/index.js";
import { normaliseRawJob } from "./pipeline/normalise.js";
import { parseSalary, classifySalary } from "./pipeline/salary.js";
import { checkSponsorPhrases, determineSponsorStatus } from "./pipeline/sponsorText.js";
import { scoreJob } from "./pipeline/score.js";
import type { FetchContext, Job, RawJob, RunSourceResult, Source } from "./types.js";

type Config = ReturnType<typeof loadConfig>;

export function todayIso(): string {
  return new Date().toISOString();
}

export function todayDate(): string {
  return todayIso().slice(0, 10);
}

export function buildFetchContext(
  cacheDir: string,
  politeness: Config["sources"]["politeness"],
  sourceId: string,
  log: Logger,
): FetchContext {
  return {
    userAgent: politeness.userAgent,
    cacheDir,
    timeoutMs: politeness.timeoutMs,
    retries: politeness.retries,
    minIntervalMsPerHost: Math.round(1000 / politeness.maxRequestsPerSecondPerHost),
    log: (msg: string) => log.info({ source: sourceId }, msg),
  };
}

export function enrichRawJob(
  raw: RawJob,
  sourceId: string,
  nowIso: string,
  sponsorIndex: SponsorIndex,
  profile: Config["profile"],
): Job {
  const normalised = normaliseRawJob(raw, sourceId, nowIso);
  const { salaryMin, salaryMax, isContract } = parseSalary(normalised.salaryText);
  const salaryClass = classifySalary(salaryMin, salaryMax, profile.salary.floor, profile.salary.target);

  const matchResult = sponsorIndex.match(normalised.employerRaw);
  const phraseText = `${normalised.title}\n${normalised.description ?? ""}`;
  const phrases = checkSponsorPhrases(phraseText, profile.sponsorPhrases.negative, profile.sponsorPhrases.positive);
  const sponsorStatus = determineSponsorStatus(matchResult.confidence, phrases);

  const scoreResult = scoreJob(
    normalised.title,
    normalised.description,
    normalised.location,
    normalised.remoteType,
    profile,
  );

  return {
    ...normalised,
    salaryMin,
    salaryMax,
    isContract,
    salaryClass,
    sponsorStatus,
    sponsorMatchName: matchResult.record?.organisationName,
    sponsorRating: matchResult.record?.typeRating,
    sponsorConfidence: matchResult.confidence,
    score: scoreResult.score,
    excludedReason: scoreResult.excludedReason,
    status: "new",
  };
}

async function runSource(
  source: Source,
  ctx: FetchContext,
  db: ScoutDb,
  runId: string,
  sponsorIndex: SponsorIndex,
  profile: Config["profile"],
  log: Logger,
): Promise<RunSourceResult> {
  const startedAt = Date.now();
  db.startRun(runId, source.id, new Date(startedAt).toISOString());

  try {
    const rawJobs = await source.fetchJobs(ctx);
    const nowIso = todayIso();
    for (const raw of rawJobs) {
      db.upsertJob(enrichRawJob(raw, source.id, nowIso, sponsorIndex, profile));
    }
    const result: RunSourceResult = {
      sourceId: source.id,
      status: "ok",
      count: rawJobs.length,
      durationMs: Date.now() - startedAt,
    };
    db.finishRun(runId, source.id, result, todayIso());
    log.info({ source: source.id, count: result.count, ms: result.durationMs }, "source ok");
    return result;
  } catch (err) {
    const result: RunSourceResult = {
      sourceId: source.id,
      status: "failed",
      count: 0,
      error: (err as Error).message,
      durationMs: Date.now() - startedAt,
    };
    db.finishRun(runId, source.id, result, todayIso());
    log.error({ source: source.id, err: result.error }, "source failed");
    return result;
  }
}

export async function updateSponsorRegister(
  db: ScoutDb,
  userAgent: string,
  log: Logger,
): Promise<{ count: number }> {
  log.info("Fetching Home Office sponsor register...");
  const records = await fetchAndParseRegister(userAgent);
  db.replaceSponsors(records);
  const count = db.sponsorCount();
  log.info({ count }, "Sponsor register updated");
  return { count };
}

export type SourceProgress = {
  sourceId: string;
  index: number;
  total: number;
  status: "running" | "ok" | "failed";
  count?: number;
  error?: string;
};

export async function runAllSources(
  db: ScoutDb,
  config: Config,
  root: string,
  log: Logger,
  onProgress?: (p: SourceProgress) => void,
): Promise<RunSourceResult[]> {
  const runId = todayIso();
  const cacheDir = path.join(root, "data", "cache", todayDate());

  const sponsorRecords = db.getAllSponsors();
  if (sponsorRecords.length === 0) {
    log.warn(
      "Sponsor register is empty. Run sponsors:update first, or every job will show sponsor status 'unclear'.",
    );
  }
  const sponsorIndex = new SponsorIndex(sponsorRecords);

  const atsSources = config.sources.sources.ats.enabled ? buildAtsSources(config.companies.companies) : [];
  const jobBoardSources = buildJobBoardSources(config.sources.sources);
  const allSources = [...atsSources, ...jobBoardSources];

  const results: RunSourceResult[] = [];
  for (let i = 0; i < allSources.length; i++) {
    const source = allSources[i]!;
    onProgress?.({ sourceId: source.id, index: i, total: allSources.length, status: "running" });
    const ctx = buildFetchContext(cacheDir, config.sources.politeness, source.id, log);
    const result = await runSource(source, ctx, db, runId, sponsorIndex, config.profile, log);
    results.push(result);
    onProgress?.({
      sourceId: source.id,
      index: i,
      total: allSources.length,
      status: result.status === "ok" ? "ok" : "failed",
      count: result.count,
      error: result.error,
    });
  }
  return results;
}
