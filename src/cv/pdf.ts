import puppeteer from "puppeteer";
import { marked } from "marked";

const PDF_STYLE = `
  body { font: 15px/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; margin: 0; }
  h1 { font-size: 1.6rem; margin: 0 0 0.3rem; }
  h2 { font-size: 1.1rem; margin: 1.3rem 0 0.4rem; border-bottom: 1px solid #ccc; padding-bottom: 0.2rem; }
  h3 { font-size: 1rem; margin: 1rem 0 0.2rem; }
  p { margin: 0.4rem 0; }
  ul { margin: 0.3rem 0; padding-left: 1.3rem; }
  li { margin: 0.15rem 0; }
  a { color: #0b5fae; }
  strong { font-weight: 600; }
`;

function wrapHtml(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PDF_STYLE}</style></head><body>${bodyHtml}</body></html>`;
}

export type PdfJob = { markdown: string; outPath: string };

/** Renders one or more markdown documents to PDF, sharing a single headless Chromium
 *  instance (each extra page costs ~tens of ms; a whole extra browser launch costs ~1s). */
export async function renderMarkdownToPdfs(jobs: PdfJob[]): Promise<void> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    for (const job of jobs) {
      const html = wrapHtml(await marked.parse(job.markdown));
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: "load" });
        await page.pdf({
          path: job.outPath,
          format: "A4",
          printBackground: true,
          margin: { top: "18mm", bottom: "18mm", left: "18mm", right: "18mm" },
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
