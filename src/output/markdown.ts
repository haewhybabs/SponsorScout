import type { Job } from "../types.js";
import type { DigestModel } from "./model.js";

function sponsorBadge(job: Job): string {
  const parts: string[] = [];
  if (job.sponsorMatchName) {
    parts.push(`matched "${job.sponsorMatchName}"`);
    if (job.sponsorRating) parts.push(job.sponsorRating);
    parts.push(`confidence: ${job.sponsorConfidence}`);
  } else {
    parts.push("not found on register");
  }
  return parts.join(" · ");
}

function jobCard(job: Job): string {
  const lines = [
    `#### [${job.title}](${job.url})`,
    `**${job.employerRaw}** · ${job.location} (${job.remoteType})`,
    `Salary: ${job.salaryText ?? "not shown"}`,
    `Sponsor: ${sponsorBadge(job)}`,
    `Source: ${job.source}${job.postedAt ? ` · posted ${job.postedAt.slice(0, 10)}` : ""}${
      job.closingAt ? ` · closes ${job.closingAt.slice(0, 10)}` : ""
    }`,
  ];
  return lines.join("  \n");
}

function jobList(jobs: Job[]): string {
  if (jobs.length === 0) return "_None today._";
  return jobs.map(jobCard).join("\n\n");
}

export function renderMarkdown(model: DigestModel): string {
  const summary = [
    `${model.totalNew} new today`,
    `${model.strongCount} strong`,
    `${model.borderlineCount} borderline`,
    `${model.unknownSalaryCount} salary unknown`,
    `${model.sourcesFailedCount} sources failed`,
  ].join(" · ");

  const sourceHealth = model.runResults
    .map((r) => `- **${r.sourceId}**: ${r.status}${r.error ? ` (${r.error})` : ""} — ${r.count} jobs`)
    .join("\n");

  const excluded = Object.entries(model.excludedCounts)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(", ");

  return `# SponsorScout Digest — ${model.date}

${summary}

## ✅ Strong matches

${jobList(model.strong)}

## ⚠️ Check salary

${jobList(model.checkSalary)}

## ❓ Check sponsor

${jobList(model.checkSponsor)}

## Source health

${sourceHealth || "_No sources ran._"}

---
Excluded: ${excluded}
`;
}
