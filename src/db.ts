import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync } from "node:fs";
import type { Job, JobUiStatus, SponsorRecord, RunSourceResult } from "./types.js";
import type { SourceCategory } from "./sources/category.js";
import { CATEGORY_SOURCE_IDS } from "./sources/category.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, "..", "data", "sponsorscout.db");

export type JobFilters = {
  sponsorStatus?: Job["sponsorStatus"];
  salaryClass?: Job["salaryClass"];
  source?: string;
  category?: SourceCategory;
  remoteType?: Job["remoteType"];
  status?: JobUiStatus;
  /** Hide jobs excluded from the digest (negative sponsorship phrase, below salary, or hard negative keyword). */
  excludeExcluded?: boolean;
  /** ISO timestamp - only jobs posted on/after this date. Jobs with no known posted date are excluded
   *  when this is set, since we can't confirm they fall inside the window. */
  postedSince?: string;
  search?: string;
  sort?: "score" | "firstSeenAt" | "postedAt";
  limit?: number;
  offset?: number;
};

function sqlList(ids: string[]): string {
  return ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
}

const ALL_NON_COMPANY_SOURCE_IDS = Object.values(CATEGORY_SOURCE_IDS).flat();
const CATEGORY_SQL: Record<SourceCategory, string> = {
  company: `source NOT IN (${sqlList(ALL_NON_COMPANY_SOURCE_IDS)})`,
  ...(Object.fromEntries(
    Object.entries(CATEGORY_SOURCE_IDS).map(([category, ids]) => [
      category,
      `source IN (${sqlList(ids!)})`,
    ]),
  ) as Record<Exclude<SourceCategory, "company">, string>),
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  employer_raw TEXT NOT NULL,
  employer_normalised TEXT NOT NULL,
  location TEXT NOT NULL,
  remote_type TEXT NOT NULL,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_text TEXT,
  is_contract INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL,
  description TEXT,
  posted_at TEXT,
  closing_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  sponsor_status TEXT NOT NULL,
  sponsor_match_name TEXT,
  sponsor_rating TEXT,
  sponsor_confidence TEXT NOT NULL,
  salary_class TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  excluded_reason TEXT,
  status TEXT NOT NULL DEFAULT 'new'
);

CREATE TABLE IF NOT EXISTS sponsors (
  organisation_name TEXT NOT NULL,
  normalised_name TEXT NOT NULL,
  town TEXT,
  county TEXT,
  type_rating TEXT,
  route TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sponsors_normalised_name ON sponsors(normalised_name);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  PRIMARY KEY (run_id, source_id)
);

CREATE TABLE IF NOT EXISTS sent (
  job_id TEXT NOT NULL,
  digest_date TEXT NOT NULL,
  PRIMARY KEY (job_id, digest_date)
);
`;

export class ScoutDb {
  readonly db: Database.Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
    this.migrate();
  }

  /** Add columns introduced after a DB already existed on disk. */
  private migrate() {
    const columns = this.db.prepare(`PRAGMA table_info(jobs)`).all() as Array<{ name: string }>;
    const hasStatus = columns.some((c) => c.name === "status");
    if (!hasStatus) {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN status TEXT NOT NULL DEFAULT 'new'`);
    }
  }

  close() {
    this.db.close();
  }

  // --- sponsors ---

  replaceSponsors(records: SponsorRecord[]) {
    const tx = this.db.transaction((rows: SponsorRecord[]) => {
      this.db.prepare("DELETE FROM sponsors").run();
      const insert = this.db.prepare(
        `INSERT INTO sponsors (organisation_name, normalised_name, town, county, type_rating, route, imported_at)
         VALUES (@organisationName, @normalisedName, @town, @county, @typeRating, @route, @importedAt)`,
      );
      for (const r of rows) insert.run(r);
    });
    tx(records);
  }

  getAllSponsors(): SponsorRecord[] {
    const rows = this.db.prepare(`SELECT * FROM sponsors`).all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      organisationName: r.organisation_name as string,
      normalisedName: r.normalised_name as string,
      town: (r.town as string) ?? undefined,
      county: (r.county as string) ?? undefined,
      typeRating: (r.type_rating as string) ?? undefined,
      route: r.route as string,
      importedAt: r.imported_at as string,
    }));
  }

  sponsorCount(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as c FROM sponsors`).get() as { c: number };
    return row.c;
  }

  // --- jobs ---

  getJob(id: string): Job | undefined {
    const row = this.db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToJob(row) : undefined;
  }

  upsertJob(job: Job) {
    const existing = this.getJob(job.id);
    const firstSeenAt = existing?.firstSeenAt ?? job.firstSeenAt;
    this.db
      .prepare(
        `INSERT INTO jobs (
          id, source, external_id, title, employer_raw, employer_normalised, location, remote_type,
          salary_min, salary_max, salary_text, is_contract, url, description, posted_at, closing_at,
          first_seen_at, last_seen_at, sponsor_status, sponsor_match_name, sponsor_rating,
          sponsor_confidence, salary_class, score, excluded_reason, status
        ) VALUES (
          @id, @source, @externalId, @title, @employerRaw, @employerNormalised, @location, @remoteType,
          @salaryMin, @salaryMax, @salaryText, @isContract, @url, @description, @postedAt, @closingAt,
          @firstSeenAt, @lastSeenAt, @sponsorStatus, @sponsorMatchName, @sponsorRating,
          @sponsorConfidence, @salaryClass, @score, @excludedReason, @status
        )
        ON CONFLICT(id) DO UPDATE SET
          source=excluded.source, external_id=excluded.external_id, title=excluded.title,
          employer_raw=excluded.employer_raw, employer_normalised=excluded.employer_normalised,
          location=excluded.location, remote_type=excluded.remote_type, salary_min=excluded.salary_min,
          salary_max=excluded.salary_max, salary_text=excluded.salary_text, is_contract=excluded.is_contract,
          url=excluded.url, description=excluded.description, posted_at=excluded.posted_at,
          closing_at=excluded.closing_at, last_seen_at=excluded.last_seen_at,
          sponsor_status=excluded.sponsor_status, sponsor_match_name=excluded.sponsor_match_name,
          sponsor_rating=excluded.sponsor_rating, sponsor_confidence=excluded.sponsor_confidence,
          salary_class=excluded.salary_class, score=excluded.score, excluded_reason=excluded.excluded_reason`,
        // Deliberately NOT updating status here: a job re-fetched from the same source
        // keeps whatever applied/ignored/new state the user already set on it.
      )
      .run({
        ...job,
        firstSeenAt,
        isContract: job.isContract ? 1 : 0,
        externalId: job.externalId ?? null,
        salaryMin: job.salaryMin ?? null,
        salaryMax: job.salaryMax ?? null,
        salaryText: job.salaryText ?? null,
        description: job.description ?? null,
        postedAt: job.postedAt ?? null,
        closingAt: job.closingAt ?? null,
        sponsorMatchName: job.sponsorMatchName ?? null,
        sponsorRating: job.sponsorRating ?? null,
        excludedReason: job.excludedReason ?? null,
      });
  }

  jobsFirstSeenSince(sinceIso: string): Job[] {
    const rows = this.db
      .prepare(`SELECT * FROM jobs WHERE first_seen_at >= ? ORDER BY score DESC`)
      .all(sinceIso) as Array<Record<string, unknown>>;
    return rows.map(rowToJob);
  }

  updateJobStatus(id: string, status: JobUiStatus) {
    this.db.prepare(`UPDATE jobs SET status = ? WHERE id = ?`).run(status, id);
  }

  private buildWhereClause(filters: JobFilters): { where: string; params: unknown[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.sponsorStatus) {
      clauses.push("sponsor_status = ?");
      params.push(filters.sponsorStatus);
    }
    if (filters.salaryClass) {
      clauses.push("salary_class = ?");
      params.push(filters.salaryClass);
    }
    if (filters.source) {
      clauses.push("source = ?");
      params.push(filters.source);
    }
    if (filters.category) {
      clauses.push(CATEGORY_SQL[filters.category]);
    }
    if (filters.remoteType) {
      clauses.push("remote_type = ?");
      params.push(filters.remoteType);
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.excludeExcluded) {
      clauses.push("excluded_reason IS NULL AND sponsor_status != 'no' AND salary_class != 'below'");
    }
    if (filters.postedSince) {
      clauses.push("posted_at >= ?");
      params.push(filters.postedSince);
    }
    if (filters.search) {
      clauses.push("(title LIKE ? OR employer_raw LIKE ?)");
      const like = `%${filters.search}%`;
      params.push(like, like);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return { where, params };
  }

  getJobsFiltered(filters: JobFilters = {}): Job[] {
    const { where, params } = this.buildWhereClause(filters);
    const sortColumn =
      filters.sort === "firstSeenAt" ? "first_seen_at" : filters.sort === "postedAt" ? "posted_at" : "score";
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const rows = this.db
      .prepare(`SELECT * FROM jobs ${where} ORDER BY ${sortColumn} DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<Record<string, unknown>>;
    return rows.map(rowToJob);
  }

  countJobsFiltered(filters: JobFilters = {}): number {
    const { where, params } = this.buildWhereClause(filters);
    const row = this.db.prepare(`SELECT COUNT(*) as c FROM jobs ${where}`).get(...params) as { c: number };
    return row.c;
  }

  distinctSources(): string[] {
    const rows = this.db.prepare(`SELECT DISTINCT source FROM jobs ORDER BY source`).all() as Array<{
      source: string;
    }>;
    return rows.map((r) => r.source);
  }

  // --- sent tracking ---

  markSent(jobIds: string[], digestDate: string) {
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO sent (job_id, digest_date) VALUES (?, ?)`,
    );
    const tx = this.db.transaction((ids: string[]) => {
      for (const id of ids) insert.run(id, digestDate);
    });
    tx(jobIds);
  }

  alreadySent(jobId: string): boolean {
    const row = this.db.prepare(`SELECT 1 FROM sent WHERE job_id = ? LIMIT 1`).get(jobId);
    return row !== undefined;
  }

  // --- runs ---

  startRun(runId: string, sourceId: string, startedAt: string) {
    this.db
      .prepare(
        `INSERT INTO runs (run_id, source_id, started_at, status, count) VALUES (?, ?, ?, 'running', 0)`,
      )
      .run(runId, sourceId, startedAt);
  }

  finishRun(runId: string, sourceId: string, result: RunSourceResult, finishedAt: string) {
    this.db
      .prepare(
        `UPDATE runs SET finished_at = ?, status = ?, count = ?, error = ? WHERE run_id = ? AND source_id = ?`,
      )
      .run(finishedAt, result.status, result.count, result.error ?? null, runId, sourceId);
  }

  latestRunResults(runId: string): RunSourceResult[] {
    const rows = this.db
      .prepare(
        `SELECT source_id, status, count, error FROM runs WHERE run_id = ?`,
      )
      .all(runId) as Array<{ source_id: string; status: string; count: number; error: string | null }>;
    return rows.map((r) => ({
      sourceId: r.source_id,
      status: r.status as RunSourceResult["status"],
      count: r.count,
      error: r.error ?? undefined,
      durationMs: 0,
    }));
  }

  /** Latest run result per source whose run started on the given YYYY-MM-DD date. */
  getRunResultsForDate(date: string): RunSourceResult[] {
    const rows = this.db
      .prepare(
        `SELECT source_id, status, count, error FROM runs WHERE started_at LIKE ? ORDER BY started_at DESC`,
      )
      .all(`${date}%`) as Array<{ source_id: string; status: string; count: number; error: string | null }>;
    const bySource = new Map<string, RunSourceResult>();
    for (const r of rows) {
      if (bySource.has(r.source_id)) continue;
      bySource.set(r.source_id, {
        sourceId: r.source_id,
        status: r.status as RunSourceResult["status"],
        count: r.count,
        error: r.error ?? undefined,
        durationMs: 0,
      });
    }
    return [...bySource.values()];
  }
}

function rowToJob(r: Record<string, unknown>): Job {
  return {
    id: r.id as string,
    source: r.source as string,
    externalId: (r.external_id as string) ?? undefined,
    title: r.title as string,
    employerRaw: r.employer_raw as string,
    employerNormalised: r.employer_normalised as string,
    location: r.location as string,
    remoteType: r.remote_type as Job["remoteType"],
    salaryMin: (r.salary_min as number) ?? undefined,
    salaryMax: (r.salary_max as number) ?? undefined,
    salaryText: (r.salary_text as string) ?? undefined,
    isContract: Boolean(r.is_contract),
    url: r.url as string,
    description: (r.description as string) ?? undefined,
    postedAt: (r.posted_at as string) ?? undefined,
    closingAt: (r.closing_at as string) ?? undefined,
    firstSeenAt: r.first_seen_at as string,
    lastSeenAt: r.last_seen_at as string,
    sponsorStatus: r.sponsor_status as Job["sponsorStatus"],
    sponsorMatchName: (r.sponsor_match_name as string) ?? undefined,
    sponsorRating: (r.sponsor_rating as string) ?? undefined,
    sponsorConfidence: r.sponsor_confidence as Job["sponsorConfidence"],
    salaryClass: r.salary_class as Job["salaryClass"],
    score: r.score as number,
    excludedReason: (r.excluded_reason as string) ?? undefined,
    status: r.status as Job["status"],
  };
}

export { DEFAULT_DB_PATH };
