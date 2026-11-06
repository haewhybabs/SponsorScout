import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "pino";

import { loadConfig } from "./config.js";
import { ScoutDb, type JobFilters } from "./db.js";
import { runAllSources, todayDate, updateSponsorRegister, type SourceProgress } from "./orchestrate.js";
import type { JobUiStatus } from "./types.js";
import { sourceCategory, SOURCE_CATEGORIES, SOURCE_CATEGORY_LABELS, type SourceCategory } from "./sources/category.js";
import { generateApplication, NoCvError } from "./cv/generateApplication.js";
import { ClaudeCodeError } from "./cv/claudeCodeRunner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "webui", "public");

type UpdatePhase = "idle" | "sponsors" | "sources" | "done" | "error";

type UpdateState = {
  running: boolean;
  phase: UpdatePhase;
  startedAt?: string;
  finishedAt?: string;
  sponsorCount?: number;
  sources: SourceProgress[];
  error?: string;
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

async function serveStatic(res: ServerResponse, requestPath: string): Promise<void> {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

export async function startServer(root: string, port: number, log: Logger): Promise<void> {
  const db = new ScoutDb();
  const updateState: UpdateState = { running: false, phase: "idle", sources: [] };

  async function runUpdate(includeSponsors: boolean): Promise<void> {
    if (updateState.running) return;
    updateState.running = true;
    updateState.phase = includeSponsors ? "sponsors" : "sources";
    updateState.startedAt = new Date().toISOString();
    updateState.finishedAt = undefined;
    updateState.error = undefined;
    updateState.sources = [];

    try {
      const config = loadConfig();
      if (includeSponsors) {
        const { count } = await updateSponsorRegister(db, config.sources.politeness.userAgent, log);
        updateState.sponsorCount = count;
      }
      updateState.phase = "sources";
      await runAllSources(db, config, root, log, (progress) => {
        const existingIndex = updateState.sources.findIndex((s) => s.sourceId === progress.sourceId);
        if (existingIndex >= 0) updateState.sources[existingIndex] = progress;
        else updateState.sources.push(progress);
      });
      updateState.phase = "done";
    } catch (err) {
      updateState.phase = "error";
      updateState.error = (err as Error).message;
      log.error({ err: updateState.error }, "update failed");
    } finally {
      updateState.running = false;
      updateState.finishedAt = new Date().toISOString();
    }
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const { pathname } = url;

      if (pathname === "/api/jobs" && req.method === "GET") {
        const filters: JobFilters = {
          sponsorStatus: (url.searchParams.get("sponsorStatus") as JobFilters["sponsorStatus"]) || undefined,
          salaryClass: (url.searchParams.get("salaryClass") as JobFilters["salaryClass"]) || undefined,
          source: url.searchParams.get("source") || undefined,
          category: (url.searchParams.get("category") as SourceCategory) || undefined,
          remoteType: (url.searchParams.get("remoteType") as JobFilters["remoteType"]) || undefined,
          status: (url.searchParams.get("status") as JobUiStatus) || undefined,
          search: url.searchParams.get("search") || undefined,
          excludeExcluded: url.searchParams.get("excludeExcluded") === "true",
          postedSince: url.searchParams.get("postedSince") || undefined,
          sort: (url.searchParams.get("sort") as JobFilters["sort"]) || "score",
          limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
          offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
        };
        const jobs = db.getJobsFiltered(filters);
        const total = db.countJobsFiltered(filters);
        sendJson(res, 200, { jobs, total, limit: filters.limit, offset: filters.offset });
        return;
      }

      const statusMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/status$/);
      if (statusMatch && req.method === "POST") {
        const body = JSON.parse(await readBody(req)) as { status?: JobUiStatus };
        if (!body.status || !["new", "applied", "ignored"].includes(body.status)) {
          sendJson(res, 400, { error: "status must be one of new|applied|ignored" });
          return;
        }
        db.updateJobStatus(statusMatch[1]!, body.status);
        sendJson(res, 200, { ok: true });
        return;
      }

      const generateMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/generate$/);
      if (generateMatch && req.method === "POST") {
        const job = db.getJob(generateMatch[1]!);
        if (!job) {
          sendJson(res, 404, { error: "Job not found" });
          return;
        }
        try {
          const result = await generateApplication(job, root);
          sendJson(res, 200, {
            tailoredCv: result.tailoredCv,
            coverLetter: result.coverLetter,
            savedDir: result.savedDir,
            cvPdfUrl: `/api/jobs/${job.id}/application/${result.cvPdfFile}`,
            coverLetterPdfUrl: `/api/jobs/${job.id}/application/${result.coverLetterPdfFile}`,
            note: result.note,
          });
        } catch (err) {
          if (err instanceof NoCvError) {
            sendJson(res, 400, { error: err.message });
            return;
          }
          const message = err instanceof ClaudeCodeError ? err.message : (err as Error).message;
          log.error({ err: message, jobId: job.id }, "generate application failed");
          sendJson(res, 502, { error: message });
        }
        return;
      }

      const applicationFileMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/application\/(cv|cover-letter)\.pdf$/);
      if (applicationFileMatch && req.method === "GET") {
        const [, jobId, doc] = applicationFileMatch;
        const applicationsDir = path.join(root, "reports", "applications");
        const filePath = path.join(applicationsDir, jobId!, `${doc}.pdf`);
        if (!filePath.startsWith(applicationsDir + path.sep)) {
          res.writeHead(403).end("Forbidden");
          return;
        }
        try {
          const data = await readFile(filePath);
          res.writeHead(200, {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${doc}.pdf"`,
          });
          res.end(data);
        } catch {
          sendJson(res, 404, { error: "Generated PDF not found - generate the application first" });
        }
        return;
      }

      if (pathname === "/api/sources" && req.method === "GET") {
        const config = loadConfig();
        sendJson(res, 200, {
          companies: config.companies.companies,
          dbSources: db.distinctSources().map((source) => ({ source, category: sourceCategory(source) })),
          categories: SOURCE_CATEGORIES.map((category) => ({ category, label: SOURCE_CATEGORY_LABELS[category] })),
        });
        return;
      }

      if (pathname === "/api/sources/health" && req.method === "GET") {
        sendJson(res, 200, { results: db.getRunResultsForDate(todayDate()) });
        return;
      }

      if (pathname === "/api/update" && req.method === "POST") {
        const body = await readBody(req);
        const includeSponsors = body ? Boolean(JSON.parse(body).includeSponsors) : false;
        if (updateState.running) {
          sendJson(res, 409, { error: "An update is already running" });
          return;
        }
        void runUpdate(includeSponsors);
        sendJson(res, 202, { started: true });
        return;
      }

      if (pathname === "/api/update/status" && req.method === "GET") {
        sendJson(res, 200, updateState);
        return;
      }

      if (pathname.startsWith("/api/")) {
        sendJson(res, 404, { error: "Unknown API route" });
        return;
      }

      await serveStatic(res, pathname);
    } catch (err) {
      log.error({ err: (err as Error).message }, "request failed");
      sendJson(res, 500, { error: (err as Error).message });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`SponsorScout dashboard running at http://localhost:${port}`);
  log.info({ port }, "server started");

  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    // Force-close any open keep-alive sockets rather than waiting on them - this is a
    // local dev tool, not a production server with in-flight requests worth draining.
    server.closeAllConnections();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    // Safety net: if something still won't let go (e.g. tsx watch restarts), don't hang.
    setTimeout(() => process.exit(0), 2000).unref();
  }
  // tsx watch (and most process managers) send SIGTERM on restart, not SIGINT - handling
  // only SIGINT left every file-save during dev leaving an orphaned process behind.
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
