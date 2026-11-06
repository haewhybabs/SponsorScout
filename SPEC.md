# SponsorScout: Spec

A personal tool that runs once a day, collects UK software engineering jobs from several sources, keeps only roles that are **likely to offer Skilled Worker visa sponsorship** and **pay above £50,271**, and sends me a short digest of what's new today.

> Read this whole spec before writing code. Build in the phases at the end and stop after each phase so I can review.

---

## 1. Why this exists

I'm a senior software engineer in the UK on a Skilled Worker visa. Under the new settlement rules, the fast route to ILR needs **taxable earnings of £50,271+ in 3 of the previous 5 years**. So I need jobs that:

1. are with an employer on the Home Office **register of licensed sponsors** (and don't say "no sponsorship"), and
2. pay **comfortably above £50,271**. My target is £55,000+, because pension salary sacrifice reduces taxable pay.

General boards (LinkedIn, Indeed) are full of roles that fail one or both, so this tool filters hard.

## 2. Goals and non-goals

**Goals**
- Fetch jobs daily from the sources in §5.
- Normalise every job into one schema (§6).
- Check every employer against the latest sponsor register (§7).
- Parse salary and classify it (§8).
- Score relevance against my profile (§9).
- Dedupe across sources and across days. Each job appears once, on the day it's first seen.
- Produce a daily digest (§10) and say clearly if any source failed.

**Non-goals**
- No LinkedIn, Indeed, Glassdoor scraping (they block it, and the signal is poor).
- No auto-applying.
- No login-protected sources.
- No heavy UI. A generated HTML page and an email are enough.

## 3. Tech stack

- **Node.js 20+, TypeScript** (strict mode)
- **pnpm**
- Fetching: native `fetch`; **cheerio** for HTML; **rss-parser** for feeds; **playwright** only for sources that render with JavaScript.
- Storage: **SQLite** via **better-sqlite3**
- Fuzzy matching: **fuse.js** (or a simple token-based similarity, whichever proves more accurate in tests)
- CSV: **csv-parse**
- Config: **YAML** (`config/*.yaml`) validated with **zod**
- Testing: **vitest**, with saved HTML/JSON fixtures for every source
- Scheduling: **GitHub Actions** cron (daily, ~06:30 UK time)
- Email: **Resend** or **Nodemailer (SMTP)**, chosen by env var

## 4. Project structure

```
sponsorscout/
  src/
    cli.ts                  # entry: commands in §11
    config.ts               # loads + validates YAML
    db.ts                   # SQLite schema + queries
    types.ts                # Job, Source, SponsorRecord, etc.
    sources/
      index.ts              # registry of enabled sources
      ats/greenhouse.ts
      ats/lever.ts
      ats/ashby.ts
      ats/workable.ts
      ats/smartrecruiters.ts
      ats/teamtailor.ts
      huntukvisasponsors.ts
      visasponsorjobs.ts
      findajob.ts
      jobsacuk.ts
      societyrse.ts
      nhsjobs.ts
    sponsors/
      register.ts           # download + parse register CSV
      match.ts              # employer → sponsor matching
    pipeline/
      normalise.ts
      salary.ts
      sponsorText.ts        # "no sponsorship" phrase detection
      score.ts
      dedupe.ts
    output/
      html.ts
      email.ts
      markdown.ts
  config/
    profile.yaml            # keywords, locations, salary thresholds
    companies.yaml          # company careers sources (ATS + slug)
    sources.yaml            # enable/disable sources, per-source options
  fixtures/                 # saved responses for tests
  test/
  data/sponsorscout.db      # git-ignored
  reports/                  # generated digests, git-ignored
  .github/workflows/daily.yml
```

## 5. Sources

Each source is an isolated module implementing:

```ts
interface Source {
  id: string;                      // e.g. "greenhouse:monzo"
  fetchJobs(ctx: FetchContext): Promise<RawJob[]>;
}
```

One source failing must **never** stop the run. Catch, log, record in `runs`, report in digest.

### Tier 1: build first

| Source | Method | Notes |
|---|---|---|
| **Home Office register of licensed sponsors** | CSV download | Publication page: `https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers`. The CSV URL changes when updated, so **scrape the publication page for the current `.csv` link** and don't hard-code it. Refresh daily. |
| **Company careers pages (via ATS APIs)** | JSON | Companies listed in `config/companies.yaml`. Implement these ATS adapters (**verify each endpoint against live docs/responses before relying on it**):<br>• Greenhouse: `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`<br>• Lever: `https://api.lever.co/v0/postings/{slug}?mode=json`<br>• Ashby: `https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true`<br>• Workable: public widget/jobs endpoint for `{subdomain}`<br>• SmartRecruiters: `https://api.smartrecruiters.com/v1/companies/{id}/postings`<br>• Teamtailor: `https://{company}.teamtailor.com/jobs` (RSS/JSON if available, else HTML) |
| **Hunt UK Visa Sponsors** | HTML (cheerio) | `https://huntukvisasponsors.com/jobs/role/software-engineer/...`. Lists sponsor-only jobs by role + town. Inspect page structure first, save fixtures, and check `robots.txt`. |
| **visasponsor.jobs** | HTML (cheerio) | Skilled Worker sponsorship jobs. Same approach as above. |

### Tier 2: add after Tier 1 works

| Source | Method | Notes |
|---|---|---|
| **DWP Find a Job** (`findajob.dwp.gov.uk`) | HTML | Search with keywords + salary filter where supported. Salary usually shown. |
| **Welcome to the Jungle (Otta)** | Playwright | JS-rendered. Has visa sponsorship info on many listings. |
| **Wellfound** | Playwright | JS-rendered. Visa + salary info. May require care with rate limits. |

### Tier 3: optional

| Source | Method | Notes |
|---|---|---|
| **jobs.ac.uk** | RSS | Search-based RSS feeds for software/RSE/KTP keywords. |
| **Society of RSE vacancies** | HTML/RSS | `https://society-rse.org/careers/vacancies/` |
| **NHS Jobs** | HTML | Digital/developer roles. Band 8a+ only, to stay above salary floor. |

### Politeness rules (all sources)
- Respect `robots.txt` and site terms. If a source disallows automated access, **disable it and tell me**; don't work around it.
- One run per day, max ~1 request/second per host, sensible timeout + 2 retries with backoff.
- Identify with a plain user agent like `SponsorScout/1.0 (personal job search tool)`. **Don't include my email or personal details.**
- Cache raw responses for the day in `data/cache/` so re-runs don't re-hit sites.

## 6. Data model

### Normalised job

```ts
type Job = {
  id: string;                // stable hash of canonical URL (or source + external id)
  source: string;
  externalId?: string;
  title: string;
  employerRaw: string;
  employerNormalised: string;
  location: string;
  remoteType: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  salaryMin?: number;        // annual GBP
  salaryMax?: number;
  salaryText?: string;       // original text
  url: string;
  description?: string;      // plain text
  postedAt?: string;         // ISO
  closingAt?: string;        // ISO
  firstSeenAt: string;       // ISO, set by pipeline
};
```

### SQLite tables
- `jobs`: all normalised fields, plus `sponsor_status`, `sponsor_match_name`, `sponsor_rating`, `sponsor_confidence`, `salary_class`, `score`, `excluded_reason`, `first_seen_at`, `last_seen_at`.
- `sponsors`: register rows: `organisation_name`, `normalised_name`, `town`, `county`, `type_rating`, `route`, `imported_at`.
- `runs`: `run_id`, `started_at`, `finished_at`, per-source `status`, `count`, `error`.
- `sent`: which job ids were included in which digest (prevents repeats).

## 7. Sponsor check

1. **Load register:** parse CSV; keep rows where `Route` = Skilled Worker. Store `Type & Rating` (A vs B rating).
2. **Normalise names** (both register and job employer): lowercase, remove punctuation, strip suffixes (`limited`, `ltd`, `plc`, `llp`, `uk`, `group`, `holdings`, `t/a ...`), collapse whitespace. Handle trading names where the register uses `X T/A Y`: index both X and Y.
3. **Match:** exact normalised match → `confidence: high`. Fuzzy match above a tuned threshold → `confidence: medium` and show both names in the digest. No match → `not_found`.
4. **Text check:** scan title + description for negative phrases (case-insensitive), e.g. `no sponsorship`, `unable to sponsor`, `cannot sponsor`, `not able to offer sponsorship`, `must have the right to work`, `no visa sponsorship`, `does not offer sponsorship`, `sponsorship is not available`. Positive phrases: `visa sponsorship available`, `we can sponsor`, `skilled worker visa`. Keep phrase lists in config.
5. **Final status:**
   - ✅ `likely`: on register (high/medium) **and** no negative phrase
   - ❓ `unclear`: not found on register but no negative phrase (could be a different legal entity name)
   - ❌ `no`: negative phrase found (exclude from main digest, count only)
6. Unit-test the matcher with tricky real examples, e.g. "AND Digital" ↔ "ANDigital Limited", "Daily Mail" ↔ "Associated Newspapers Ltd" (this one should **not** auto-match; it's a parent/brand mismatch and should land in `unclear`).

## 8. Salary parsing

Parse `salaryText` into annual GBP min/max. Handle:
- `£54,000 to £60,000 a year`, `£54k–£60k`, `£54,000 - £60,000 per annum`, `Up to £70,000`, `From £55,000`
- Day rates (`£450/day`) → annualise ×220 but **mark as contract** and classify separately
- Hourly → annualise ×1950
- London weighting text, "plus bonus", "DOE", "Competitive", "Negotiable" → no number

Classify (thresholds from `profile.yaml`):
- `strong`: salaryMax ≥ 55,000 **and** salaryMin ≥ 50,271 (or min unknown but max ≥ 60,000)
- `borderline`: range straddles 50,271–55,000
- `unknown`: no salary shown
- `below`: salaryMax < 50,271 → exclude

## 9. Relevance scoring

`config/profile.yaml`:

```yaml
salary:
  floor: 50271
  target: 55000
keywords:
  strong: [react native, react, typescript, node.js, node, full stack, full-stack, mobile engineer, senior software engineer, lead engineer]
  medium: [javascript, electron, kotlin, android, aws, digital health, healthtech, fintech, python, fastapi]
  negative: [graduate, junior, intern, apprentice, internship, placement, "security clearance", "sc clearance", "dv clearance", ".net only", "c# developer", salesforce, sap]
locations:
  include: [nottingham, derby, leicester, birmingham, sheffield, leeds, manchester, london, remote, "united kingdom", uk]
  remote_ok: true
seniority:
  prefer: [senior, lead, staff, principal]
```

Score = keyword hits in title (×3) + description (×1) + seniority bonus + location match − negatives. Exclude if any hard negative hits the title. Keep weights in config so I can tune them.

## 10. Daily digest

Generate `reports/YYYY-MM-DD.html` (+ `.md`) and optionally email it.

Sections, in order:
1. **Summary line:** "12 new today · 5 strong · 4 borderline · 3 salary unknown · 2 sources failed"
2. **✅ Strong matches:** sponsor likely + salary strong, sorted by score
3. **⚠️ Check salary:** sponsor likely + salary borderline/unknown
4. **❓ Check sponsor:** salary OK but employer not found on register
5. **Source health:** each source: ok / failed (error) / job count
6. Footer: count of excluded jobs by reason (no sponsorship text, below salary, irrelevant)

Each job card: **title**, employer, location + remote type, salary text, sponsor badge (with matched register name + rating, and confidence), source, posted/closing date, link.

Only include jobs **first seen today** (not already in `sent`). Add a `--since` flag to rebuild for a date range.

## 11. CLI

```
pnpm scout sponsors:update     # download + import latest register
pnpm scout run                 # fetch all enabled sources → pipeline → store
pnpm scout digest [--since YYYY-MM-DD] [--email]
pnpm scout daily               # sponsors:update + run + digest --email
pnpm scout source:test <id>    # run one source and print normalised jobs (for debugging)
pnpm scout discover            # Phase 3: suggest companies for companies.yaml
```

## 12. Company discovery (Phase 3)

`companies.yaml` is the highest-quality source but needs filling. Build `discover` to help:
1. From the register, take A-rated Skilled Worker sponsors.
2. Narrow to likely tech employers using **Companies House API** SIC codes (e.g. 62012, 62020, 62090, 63110, 63120, 64999 for fintech). Needs a free Companies House API key in env.
3. For each candidate, try to detect their ATS by probing common board URLs (Greenhouse/Lever/Ashby/Workable/Teamtailor slugs from the company name). Rate-limit hard.
4. Output a **suggested** `companies.discovered.yaml` for me to review. Never auto-merge.

Seed `companies.yaml` by hand with ~20–30 UK tech/fintech/healthtech sponsors to start.

## 13. Scheduling and secrets

- `.github/workflows/daily.yml`: cron `30 5 * * *` (UTC ≈ 06:30 UK in winter), plus `workflow_dispatch` for manual runs.
- Persist the SQLite DB between runs. Use a cache/artifact, or commit `data/` to a **private** branch (choose the simplest reliable approach and explain it).
- Secrets via GitHub Actions secrets: `RESEND_API_KEY` or SMTP creds, `DIGEST_TO_EMAIL`, `COMPANIES_HOUSE_API_KEY` (Phase 3). Nothing personal hard-coded in the repo.
- Repo should be **private**.

## 14. Testing and quality

- Every source has a fixture test: saved response → expected normalised jobs.
- Unit tests for: salary parser (≥20 cases), name normaliser, sponsor matcher (incl. false-positive cases), sponsorship phrase detector, dedupe, scorer.
- `pnpm test` and `pnpm typecheck` must pass in CI before the daily job runs.
- Structured logging (`pino` or similar) with per-source timings.

## 15. Build phases

**Phase 1 (MVP):**
- Project setup, config loading, SQLite schema
- Sponsor register download + parse + matcher (with tests)
- Greenhouse + Lever + Ashby adapters, with 5–10 seed companies
- Salary parser, sponsorship phrase detector, scorer, dedupe
- Markdown + HTML digest written to `reports/`
- `pnpm scout daily` works locally

→ **Stop and show me a sample digest.**

**Phase 2:**
- Hunt UK Visa Sponsors + visasponsor.jobs + Find a Job sources
- Workable, SmartRecruiters, Teamtailor adapters
- Email delivery
- GitHub Actions daily schedule with DB persistence

→ **Stop for review.**

**Phase 3:**
- `discover` command (register + Companies House + ATS detection)
- Tier 2 Playwright sources (Welcome to the Jungle, Wellfound)
- Tier 3 sources (jobs.ac.uk, Society of RSE, NHS Jobs)

**Later ideas (don't build yet):** AI fit score against my CV and suggested CV version; Telegram notifications; small web UI to mark jobs as applied/ignored.

## 16. Ground rules for Claude Code

- Before writing a scraper, fetch the page, inspect the real structure, save a fixture, and check `robots.txt`. Don't guess selectors.
- If an endpoint in this spec turns out to be wrong or blocked, tell me and propose an alternative. Don't silently skip it.
- Keep each source small and independent.
- Ask before adding dependencies not listed in §3.
