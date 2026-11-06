import type { Job } from "../types.js";
import type { DigestModel } from "./model.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sponsorBadgeHtml(job: Job): string {
  if (job.sponsorMatchName) {
    const rating = job.sponsorRating ? ` · ${esc(job.sponsorRating)}` : "";
    return `matched "${esc(job.sponsorMatchName)}"${rating} · confidence: ${job.sponsorConfidence}`;
  }
  return "not found on register";
}

function jobCardHtml(job: Job): string {
  const posted = job.postedAt ? ` · posted ${esc(job.postedAt.slice(0, 10))}` : "";
  const closing = job.closingAt ? ` · closes ${esc(job.closingAt.slice(0, 10))}` : "";
  return `
    <div class="card">
      <h4><a href="${esc(job.url)}">${esc(job.title)}</a></h4>
      <div class="meta"><strong>${esc(job.employerRaw)}</strong> · ${esc(job.location)} (${job.remoteType})</div>
      <div class="meta">Salary: ${esc(job.salaryText ?? "not shown")}</div>
      <div class="meta">Sponsor: ${sponsorBadgeHtml(job)}</div>
      <div class="meta small">Source: ${esc(job.source)}${posted}${closing}</div>
    </div>`;
}

function jobListHtml(jobs: Job[]): string {
  if (jobs.length === 0) return `<p class="empty">None today.</p>`;
  return jobs.map(jobCardHtml).join("\n");
}

export function renderHtml(model: DigestModel): string {
  const sourceHealthHtml = model.runResults
    .map(
      (r) =>
        `<li><strong>${esc(r.sourceId)}</strong>: ${r.status}${
          r.error ? ` (${esc(r.error)})` : ""
        } — ${r.count} jobs</li>`,
    )
    .join("\n");

  const excludedHtml = Object.entries(model.excludedCounts)
    .map(([reason, count]) => `${count} ${esc(reason)}`)
    .join(", ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SponsorScout Digest — ${esc(model.date)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; background: #fff; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.1rem; border-bottom: 1px solid #ddd; padding-bottom: 0.3rem; margin-top: 2rem; }
  .summary { color: #444; margin-bottom: 1.5rem; }
  .card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 0.8rem 1rem; margin: 0.6rem 0; }
  .card h4 { margin: 0 0 0.3rem 0; }
  .card a { text-decoration: none; color: #0a5; }
  .meta { font-size: 0.9rem; color: #333; margin: 0.15rem 0; }
  .meta.small { font-size: 0.8rem; color: #777; }
  .empty { color: #777; font-style: italic; }
  footer { margin-top: 2rem; font-size: 0.85rem; color: #666; }
  ul { padding-left: 1.2rem; }
</style>
</head>
<body>
  <h1>SponsorScout Digest — ${esc(model.date)}</h1>
  <p class="summary">${model.totalNew} new today · ${model.strongCount} strong · ${model.borderlineCount} borderline · ${model.unknownSalaryCount} salary unknown · ${model.sourcesFailedCount} sources failed</p>

  <h2>✅ Strong matches</h2>
  ${jobListHtml(model.strong)}

  <h2>⚠️ Check salary</h2>
  ${jobListHtml(model.checkSalary)}

  <h2>❓ Check sponsor</h2>
  ${jobListHtml(model.checkSponsor)}

  <h2>Source health</h2>
  <ul>${sourceHealthHtml || "<li>No sources ran.</li>"}</ul>

  <footer>Excluded: ${excludedHtml}</footer>
</body>
</html>
`;
}
