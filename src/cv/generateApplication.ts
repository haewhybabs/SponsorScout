import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Job } from "../types.js";
import { runClaudeCode, ClaudeCodeError } from "./claudeCodeRunner.js";
import { renderMarkdownToPdfs } from "./pdf.js";

export class NoCvError extends Error {}

export function assertMasterCvExists(root: string): void {
  const cvPath = path.join(root, "config", "cv.md");
  if (!existsSync(cvPath)) {
    throw new NoCvError(
      "No CV found at config/cv.md. Copy config/cv.example.md to config/cv.md and fill in your real CV first.",
    );
  }
}

export function buildPrompt(
  job: Pick<Job, "title" | "employerRaw" | "location" | "description">,
  relativeOutputDir: string,
): string {
  return `You are tailoring a CV and writing a cover letter for a specific UK job application.

Read the candidate's master CV from config/cv.md in the current directory. That file may contain
more than one CV variant (e.g. different role emphases such as backend vs. mobile/frontend),
possibly with its own instructions on how to choose between them - follow those instructions if
present. Pick, or blend, whichever variant's facts best fit this specific job.

Job details:
Title: ${job.title}
Employer: ${job.employerRaw}
Location: ${job.location}

Job description:
${job.description ?? "(no description available for this posting)"}

Using ONLY the facts in config/cv.md - never invent experience, skills, employers, dates, qualifications, or achievements that aren't there, and never mix facts from one person's job history into a role they didn't hold - produce two documents:

1. A tailored CV: the same person, the same facts, the same history, reordered and rephrased in markdown to foreground what's relevant to this job. Omission is fine; fabrication is not. The CV content itself should contain nothing but the CV - no notes about which variant you chose.
2. A cover letter (250-350 words), in the candidate's own voice, referencing specific points from the job description and specific real experience from the CV. No generic filler, no fabricated enthusiasm.

Write the tailored CV to "${relativeOutputDir}/cv.md" and the cover letter to "${relativeOutputDir}/cover-letter.md" using the Write tool (the directory already exists). Do not use any other tool. When both files are written, reply with ONLY a one-to-two sentence note on which CV variant (if more than one existed) you used or how you blended them, and why it fits this job - this note is shown to the candidate, not submitted anywhere, so it should NOT look like part of the CV or cover letter itself.`;
}

export type GeneratedApplication = {
  tailoredCv: string;
  coverLetter: string;
  savedDir: string;
  cvPdfFile: string;
  coverLetterPdfFile: string;
  note?: string;
};

export async function generateApplication(
  job: Pick<Job, "id" | "title" | "employerRaw" | "location" | "description">,
  root: string,
): Promise<GeneratedApplication> {
  assertMasterCvExists(root);

  const relativeOutputDir = path.join("reports", "applications", job.id);
  const absoluteOutputDir = path.join(root, relativeOutputDir);
  mkdirSync(absoluteOutputDir, { recursive: true });

  const prompt = buildPrompt(job, relativeOutputDir);
  const { resultText } = await runClaudeCode(prompt, root);

  const cvOutPath = path.join(absoluteOutputDir, "cv.md");
  const coverOutPath = path.join(absoluteOutputDir, "cover-letter.md");
  if (!existsSync(cvOutPath) || !existsSync(coverOutPath)) {
    // Claude often declines on purpose (e.g. the CV is still just the placeholder
    // template) and explains why in its final reply - surface that instead of a
    // generic "something went wrong".
    throw new ClaudeCodeError(resultText || "claude didn't produce both expected files, with no explanation given.");
  }

  const tailoredCv = readFileSync(cvOutPath, "utf-8");
  const coverLetter = readFileSync(coverOutPath, "utf-8");

  const cvPdfFile = "cv.pdf";
  const coverLetterPdfFile = "cover-letter.pdf";
  await renderMarkdownToPdfs([
    { markdown: tailoredCv, outPath: path.join(absoluteOutputDir, cvPdfFile) },
    { markdown: coverLetter, outPath: path.join(absoluteOutputDir, coverLetterPdfFile) },
  ]);

  return {
    tailoredCv,
    coverLetter,
    savedDir: absoluteOutputDir,
    cvPdfFile,
    coverLetterPdfFile,
    note: resultText || undefined,
  };
}
