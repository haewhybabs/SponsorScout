#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";

import { loadConfig } from "./config.js";
import { ScoutDb } from "./db.js";
import { SponsorIndex } from "./sponsors/match.js";
import { buildAtsSources, buildJobBoardSources } from "./sources/index.js";
import { buildDigestModel } from "./output/model.js";
import { renderMarkdown } from "./output/markdown.js";
import { renderHtml } from "./output/html.js";
import {
  buildFetchContext,
  enrichRawJob,
  runAllSources,
  todayDate,
  todayIso,
  updateSponsorRegister,
} from "./orchestrate.js";
import { startServer } from "./server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  // .env is optional - fine if it doesn't exist yet (e.g. before ANTHROPIC_API_KEY is set up).
}

// Logs go to stderr so stdout stays clean for command output (e.g. source:test's JSON).
const log = pino({ level: process.env.LOG_LEVEL ?? "info" }, pino.destination(2));

async function cmdSponsorsUpdate(): Promise<void> {
  const { sources } = loadConfig();
  const db = new ScoutDb();
  try {
    const { count } = await updateSponsorRegister(db, sources.politeness.userAgent, log);
    console.log(`Sponsor register updated: ${count} Skilled Worker records.`);
  } finally {
    db.close();
  }
}

async function cmdRun(): Promise<void> {
  const config = loadConfig();
  const db = new ScoutDb();
  try {
    await runAllSources(db, config, ROOT, log);
  } finally {
    db.close();
  }
}

async function cmdDigest(options: { since?: string; email?: boolean }): Promise<void> {
  const db = new ScoutDb();
  try {
    const today = todayDate();
    const isRebuild = Boolean(options.since);
    const fromDate = options.since ?? today;
    const sinceIso = `${fromDate}T00:00:00.000Z`;

    let jobs = db.jobsFirstSeenSince(sinceIso);
    if (!isRebuild) {
      jobs = jobs.filter((j) => !db.alreadySent(j.id));
    }
    const runResults = isRebuild ? [] : db.getRunResultsForDate(today);
    const label = isRebuild ? `${fromDate} to ${today}` : today;
    const model = buildDigestModel(jobs, runResults, label);

    const reportsDir = path.join(ROOT, "reports");
    mkdirSync(reportsDir, { recursive: true });
    const filenameBase = isRebuild ? `${fromDate}_to_${today}` : today;
    const mdPath = path.join(reportsDir, `${filenameBase}.md`);
    const htmlPath = path.join(reportsDir, `${filenameBase}.html`);
    writeFileSync(mdPath, renderMarkdown(model), "utf-8");
    writeFileSync(htmlPath, renderHtml(model), "utf-8");

    if (!isRebuild) {
      db.markSent(jobs.map((j) => j.id), today);
    }

    log.info({ date: label, total: model.totalNew }, "Digest written");
    console.log(`Digest written: ${mdPath} and ${htmlPath}`);
    console.log(
      `${model.totalNew} new · ${model.strongCount} strong · ${model.borderlineCount} borderline · ${model.unknownSalaryCount} salary unknown · ${model.sourcesFailedCount} sources failed`,
    );

    if (options.email) {
      log.warn("Email delivery is not implemented yet (Phase 2). Skipping --email.");
      console.log("Note: --email is not implemented yet (Phase 2). The digest was written to disk only.");
    }
  } finally {
    db.close();
  }
}

async function cmdDaily(): Promise<void> {
  await cmdSponsorsUpdate();
  await cmdRun();
  await cmdDigest({ email: true });
}

async function cmdSourceTest(sourceId: string | undefined): Promise<void> {
  if (!sourceId) {
    console.error("Usage: pnpm scout source:test <id>  (e.g. greenhouse:monzo)");
    process.exitCode = 1;
    return;
  }
  const config = loadConfig();
  const db = new ScoutDb();
  try {
    const allSources = [
      ...buildAtsSources(config.companies.companies),
      ...buildJobBoardSources(config.sources.sources),
    ];
    const source = allSources.find((s) => s.id === sourceId);
    if (!source) {
      console.error(
        `Unknown source id "${sourceId}". Known ids: ${allSources.map((s) => s.id).join(", ")}`,
      );
      process.exitCode = 1;
      return;
    }

    const sponsorIndex = new SponsorIndex(db.getAllSponsors());
    const cacheDir = path.join(ROOT, "data", "cache", todayDate());
    const ctx = buildFetchContext(cacheDir, config.sources.politeness, source.id, log);

    const rawJobs = await source.fetchJobs(ctx);
    const nowIso = todayIso();
    const jobs = rawJobs.map((raw) => enrichRawJob(raw, source.id, nowIso, sponsorIndex, config.profile));
    console.log(JSON.stringify(jobs, null, 2));
    console.error(`\n${jobs.length} jobs from ${sourceId}`);
  } finally {
    db.close();
  }
}

async function cmdServe(portArg: string | undefined): Promise<void> {
  const port = portArg ? Number(portArg) : 4321;
  await startServer(ROOT, port, log);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "sponsors:update":
      await cmdSponsorsUpdate();
      break;

    case "run":
      await cmdRun();
      break;

    case "digest": {
      const { values } = parseArgs({
        args: rest,
        options: {
          since: { type: "string" },
          email: { type: "boolean", default: false },
        },
      });
      await cmdDigest({ since: values.since, email: values.email });
      break;
    }

    case "daily":
      await cmdDaily();
      break;

    case "source:test":
      await cmdSourceTest(rest[0]);
      break;

    case "serve": {
      const { values } = parseArgs({ args: rest, options: { port: { type: "string" } } });
      await cmdServe(values.port);
      break;
    }

    case "discover":
      console.log(
        "`discover` is a Phase 3 feature (register + Companies House + ATS probing). Not implemented yet.",
      );
      process.exitCode = 1;
      break;

    default:
      console.error(
        [
          "Usage: pnpm scout <command>",
          "",
          "  sponsors:update          download + import the latest sponsor register",
          "  run                      fetch all enabled sources -> pipeline -> store",
          "  digest [--since YYYY-MM-DD] [--email]   write today's digest",
          "  daily                    sponsors:update + run + digest --email",
          "  source:test <id>         run one source and print normalised jobs",
          "  serve [--port 4321]      start the local dashboard (browse, filter, mark applied/ignored, refresh)",
        ].join("\n"),
      );
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((err) => {
  log.error({ err: (err as Error).message, stack: (err as Error).stack }, "fatal error");
  console.error(err);
  process.exitCode = 1;
});
