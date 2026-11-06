# SponsorScout

A personal tool that runs daily, collects UK software engineering job postings from
~20 sources (company ATS pages, visa-sponsorship job boards, NHS, universities, and a
handful of large non-tech UK sponsors), filters hard for genuine Skilled Worker visa
sponsorship likelihood and salary above £50,271, and produces a digest plus a local
dashboard.

See [SPEC.md](./SPEC.md) for the full design rationale.

## Setup on a new machine

```bash
pnpm install
```

Puppeteer (used for PDF generation) downloads its own headless Chromium on install.
If pnpm blocks the postinstall script, approve it once:

```bash
pnpm approve-builds puppeteer
```

### Required local file (not in git)

Your real CV lives at `config/cv.md` and is git-ignored on purpose - it has personal
details. Clone the repo, then copy your CV over separately (not via git):

```bash
cp config/cv.example.md config/cv.md
# then fill it in with your real experience
```

### Optional: `.env`

```bash
cp .env.example .env
```

Nothing is required by default. "Generate CV + cover letter" shells out to your local
`claude` CLI (the same Claude subscription your interactive sessions use), not a paid
API key - make sure `claude` is installed and logged in on this machine.

## Running it

```bash
pnpm scout sponsors:update   # download the Home Office sponsor register (~131k companies)
pnpm scout run                # fetch all enabled sources -> pipeline -> store in data/sponsorscout.db
pnpm scout digest             # write today's markdown + HTML digest to reports/
pnpm scout daily              # the three steps above, in order

pnpm run dev                  # start the local dashboard at http://localhost:4321 (auto-restarts on file changes)
pnpm scout serve              # same dashboard, without the watch/restart behaviour
```

`data/` (the SQLite job database + HTTP response cache) and `reports/` (digests and
generated CVs/cover letters) are both git-ignored - they're regenerated locally and
contain your personal application history, not source code.

## Development

```bash
pnpm test        # vitest
pnpm typecheck    # tsc --noEmit
```

`pnpm scout source:test <sourceId>` fetches and prints one source's jobs without
writing to the database - useful for checking a single source still works
(e.g. `pnpm scout source:test workday:fca`).
