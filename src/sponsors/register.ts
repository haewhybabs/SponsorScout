import { parse as parseCsv } from "csv-parse/sync";
import * as cheerio from "cheerio";
import type { SponsorRecord } from "../types.js";
import { nameVariants } from "./match.js";

const PUBLICATION_URL =
  "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";

export async function findRegisterCsvUrl(userAgent: string): Promise<string> {
  const res = await fetch(PUBLICATION_URL, { headers: { "User-Agent": userAgent } });
  if (!res.ok) {
    throw new Error(`Failed to fetch sponsor register publication page: HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  let csvUrl: string | undefined;
  $("a[href$='.csv']").each((_, el) => {
    if (csvUrl) return;
    const href = $(el).attr("href");
    if (href) csvUrl = href;
  });

  if (!csvUrl) {
    throw new Error(
      `Could not find a .csv link on the sponsor register publication page (${PUBLICATION_URL}). The page structure may have changed.`,
    );
  }
  return new URL(csvUrl, PUBLICATION_URL).toString();
}

export async function downloadRegisterCsv(csvUrl: string, userAgent: string): Promise<string> {
  const res = await fetch(csvUrl, { headers: { "User-Agent": userAgent } });
  if (!res.ok) {
    throw new Error(`Failed to download sponsor register CSV from ${csvUrl}: HTTP ${res.status}`);
  }
  return res.text();
}

type RegisterRow = {
  "Organisation Name": string;
  "Town/City": string;
  County: string;
  "Type & Rating": string;
  Route: string;
};

/** Parse the register CSV into SponsorRecords, keeping only the Skilled Worker route.
 *  "X T/A Y" organisation names are indexed under both X and Y (per spec §7.2). */
export function parseRegisterCsv(csvText: string, importedAt: string): SponsorRecord[] {
  const rows = parseCsv(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as RegisterRow[];

  const records: SponsorRecord[] = [];
  for (const row of rows) {
    const route = row.Route?.trim();
    if (route !== "Skilled Worker") continue;

    const organisationName = row["Organisation Name"]?.trim();
    if (!organisationName) continue;

    const town = row["Town/City"]?.trim() || undefined;
    const county = row.County?.trim() || undefined;
    const typeRating = row["Type & Rating"]?.trim() || undefined;

    for (const normalisedName of nameVariants(organisationName)) {
      records.push({
        organisationName,
        normalisedName,
        town,
        county,
        typeRating,
        route,
        importedAt,
      });
    }
  }
  return records;
}

export async function fetchAndParseRegister(userAgent: string): Promise<SponsorRecord[]> {
  const csvUrl = await findRegisterCsvUrl(userAgent);
  const csvText = await downloadRegisterCsv(csvUrl, userAgent);
  return parseRegisterCsv(csvText, new Date().toISOString());
}
