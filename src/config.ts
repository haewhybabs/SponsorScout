import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.resolve(__dirname, "..", "config");

const ProfileSchema = z.object({
  salary: z.object({
    floor: z.number(),
    target: z.number(),
  }),
  roleFilter: z.object({
    titleMustMatchAny: z.array(z.string()),
    engineerQualifiers: z.array(z.string()),
  }),
  keywords: z.object({
    strong: z.array(z.string()),
    medium: z.array(z.string()),
    negative: z.array(z.string()),
  }),
  locations: z.object({
    include: z.array(z.string()),
    remote_ok: z.boolean(),
  }),
  seniority: z.object({
    prefer: z.array(z.string()),
  }),
  sponsorPhrases: z.object({
    negative: z.array(z.string()),
    positive: z.array(z.string()),
  }),
  scoring: z.object({
    titleKeywordWeight: z.number(),
    descriptionKeywordWeight: z.number(),
    seniorityBonus: z.number(),
    locationMatchBonus: z.number(),
    negativeHitPenalty: z.number(),
  }),
});
export type Profile = z.infer<typeof ProfileSchema>;

const AtsEnum = z.enum([
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "workable",
  "smartrecruiters",
  "teamtailor",
]);

const CompaniesSchema = z.object({
  companies: z.array(
    z.object({
      name: z.string(),
      ats: AtsEnum,
      slug: z.string(),
      // Workday only: scope the server-side search instead of fetching every posting -
      // large multinationals (e.g. GSK) have hundreds/thousands of global postings, far
      // more than is worth fetching just to find the handful of UK software roles.
      searchTerms: z.array(z.string()).optional(),
    }),
  ),
});
export type CompaniesConfig = z.infer<typeof CompaniesSchema>;
export type CompanyEntry = CompaniesConfig["companies"][number];

const SourcesSchema = z.object({
  sources: z.object({
    sponsorRegister: z.object({ enabled: z.boolean() }),
    ats: z.object({ enabled: z.boolean() }),
    huntUkVisaSponsors: z.object({ enabled: z.boolean() }),
    jobsAcUk: z.object({ enabled: z.boolean() }),
    nhsJobs: z.object({ enabled: z.boolean() }),
    landedJobs: z.object({ enabled: z.boolean() }),
    nextLevelJobs: z.object({ enabled: z.boolean() }),
    societyRse: z.object({ enabled: z.boolean() }),
  }),
  politeness: z.object({
    userAgent: z.string(),
    maxRequestsPerSecondPerHost: z.number(),
    timeoutMs: z.number(),
    retries: z.number(),
  }),
});
export type SourcesConfig = z.infer<typeof SourcesSchema>;

function loadYaml<T>(filename: string, schema: z.ZodType<T>): T {
  const filePath = path.join(CONFIG_DIR, filename);
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(`Could not read config file ${filePath}: ${(err as Error).message}`);
  }
  const parsed = parseYaml(raw);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid config in ${filePath}:\n${result.error.toString()}`);
  }
  return result.data;
}

export function loadProfile(): Profile {
  return loadYaml("profile.yaml", ProfileSchema);
}

export function loadCompanies(): CompaniesConfig {
  return loadYaml("companies.yaml", CompaniesSchema);
}

export function loadSources(): SourcesConfig {
  return loadYaml("sources.yaml", SourcesSchema);
}

export function loadConfig() {
  return {
    profile: loadProfile(),
    companies: loadCompanies(),
    sources: loadSources(),
  };
}
