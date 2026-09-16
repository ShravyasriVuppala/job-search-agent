# Job Search Agent

An autonomous, AI-powered job search assistant. Every day it fetches fresh job
postings from multiple sources, has Claude read each one against **your**
redacted résumé, sorts them into "strong match / worth a look / skip," learns
from the jobs you actually apply to, and surfaces everything in a dashboard so
you spend your time applying instead of scrolling job boards.

It is built around a simple idea: instead of hardcoded rules like *"if the title
contains 'Senior' and the salary is above X, flag it,"* the agent gives Claude
your résumé, its own accumulated memory, and each job description, and lets the
model reason about fit the way a thoughtful recruiter would.

> **Privacy first:** your résumé is redacted (SSN, phone, email, ZIP, date of
> birth, references) *before* anything is stored in the database, sent to the
> Claude API, or written to logs. The raw file never leaves your machine.

---

## What it does

- **Fetches jobs** from two complementary sources, each on its own schedule so
  neither crowds out the other's daily analysis budget:
  - **JSearch (RapidAPI)** — a broad, quota-limited aggregator sweep (Indeed,
    LinkedIn, Glassdoor) across the titles/locations you configure, on the
    days you set (default: Mon/Wed/Fri).
  - **Greenhouse ATS** — free, full-description pulls straight from the
    "careers" boards of specific companies you list, on the remaining days.
- **Redacts PII** from your résumé, then extracts a structured profile
  (technologies, seniority, companies, certifications, soft skills).
- **Analyzes each job** with Claude, scoring **relevance** and **interview
  likelihood** and assigning a category:
  - `Strong match` — apply without hesitation
  - `Worth a look` — partial fit, worth a manual review
  - `Skip` — poor fit
- **Learns over time.** The agent keeps a memory of patterns (which skills keep
  matching, common gaps, which categories fit best) and weights the jobs you've
  actually applied to most heavily when calibrating future scores.
- **Generates cover letters on demand.** Nothing is drafted during the daily
  run — click "Generate" on a job in the dashboard and Claude writes one
  grounded in your résumé and that job's analysis. Cached after the first
  generation, so repeat views cost nothing.
- **Tracks your pipeline.** Save jobs, hide the ones you're not interested in,
  and move applications through statuses (applied → interview → offer / rejected).
- **Emails a weekly digest** of the best matches (via Mailgun).
- **Dashboard** (React) to browse and triage results, with a light/dark theme.

---

## How it works

Each daily run is a seven-step loop (`src/services/agent.service.ts`):

```
OBSERVE  → load your redacted résumé, agent memory, and recent applications
ASSESS   → Claude decides today's search strategy from that context
FETCH    → pull new postings from whichever source is scheduled today
ANALYZE  → Claude scores each job against résumé + memory + strategy
LEARN    → Claude distills patterns from today's results and your applications
STORE    → persist analyses and updated memory to Postgres
DIGEST   → (weekly, separate script) email the top matches
```

To keep costs down, the static part of each prompt (instructions + your résumé +
learned patterns) is marked for **prompt caching**, and an optional **Batch API**
mode (`USE_BATCH_API=true`) submits all of a day's jobs in one request instead of
calling Claude once per job. In batch mode the daily run submits and exits
immediately — a separate poll step (`npx ts-node src/poll-batch.ts`, run on its
own schedule) picks up the results once Anthropic finishes processing and
completes the run (saving analyses, learning patterns). The project's own
estimate for a ~50-job daily run is roughly **$0.26/day**.

### Tech stack

| Layer      | Technology                                              |
| ---------- | -------------------------------------------------------- |
| Backend    | TypeScript, Node.js, Express (REST API)                 |
| AI         | Claude (`@anthropic-ai/sdk`) with prompt caching        |
| Database   | PostgreSQL (via Docker)                                 |
| Jobs APIs  | JSearch (RapidAPI), Greenhouse ATS                      |
| Email      | Mailgun                                                 |
| Dashboard  | React, Vite, Tailwind CSS                               |

---

## Prerequisites

- **Node.js 20+** and npm
- **Docker** (for the PostgreSQL database)
- A **Claude API key** — <https://console.anthropic.com/>
- *(Optional)* a **RapidAPI key** with a JSearch subscription, if you want the
  aggregator sweep — <https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch>.
  The Greenhouse source needs no API key at all, so the agent is fully usable
  without RapidAPI.
- *(Optional, only for email digests)* a **Mailgun account** (API key + sending
  domain) — the agent still requires these variables to be set even if you
  never trigger a digest; a free Mailgun sandbox domain works fine for this.
- Your **résumé as a PDF**

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/ShravyasriVuppala/job-search-agent.git
cd job-search-agent
npm install
cd dashboard && npm install && cd ..
```

### 2. Start the database

The database runs in Docker and listens on **port 5433** (chosen to avoid
clashing with any local Postgres on 5432). The schema is loaded automatically the
first time the container is created.

```bash
docker compose up -d
```

### 3. Add your résumé

Place your résumé PDF in the project root as `resume.pdf` (this path is
git-ignored and never committed). To use a different path, set `RESUME_PATH`.

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Then edit `.env.local` and fill in the values below. `.env.local` is git-ignored
— never commit it.

### 5. Point it at your own job search

This is the part that actually makes the agent *yours* — see
[Making it yours](#making-it-yours) below for the full list of what to change.
At minimum: `JOB_TITLES`, `PREFERRED_TECHNICAL_STACK`, and — if you want the
Greenhouse source to fetch anything — `config/companies.json`.

### 6. Run it

```bash
# Run one full agent cycle (fetch → analyze → learn → store)
npm run agent

# Start the REST API (serves the dashboard's data on http://localhost:3001)
npm start

# In a second terminal, start the dashboard (http://localhost:3000)
cd dashboard && npm run dev
```

Open <http://localhost:3000> and you'll see the jobs the agent scored, grouped by
category.

---

## Making it yours

This started as a personal tool built around one job search (Senior/Staff
backend/AI engineering roles at a specific set of companies), so several
defaults reflect that. To point it at a different search:

| What to change                         | Where                                       |
| --------------------------------------- | -------------------------------------------- |
| Target job titles                       | `JOB_TITLES` in `.env.local`                 |
| Technologies you want to work with      | `PREFERRED_TECHNICAL_STACK`                  |
| Years of experience / seniority framing | `YEARS_EXPERIENCE`                           |
| Company stage preference                | `PREFERRED_COMPANY_STAGE`                    |
| Free-text context for every prompt      | `USER_CONTEXT` (e.g. "I want to move into platform/infra roles") |
| Location priority & keyword buckets     | `LOCATION_PRIORITY`, `LOCATION_KEYWORDS_*`   |
| **Which companies Greenhouse fetches**  | `config/companies.json` — see below          |
| JSearch's search terms & schedule       | `config/jsearch.json` — see below            |
| Your résumé                             | Replace `resume.pdf` (or set `RESUME_PATH`)  |

Everything else (redaction, learning, the dashboard, cost controls) works the
same regardless of what you're searching for.

### `config/companies.json` — which companies Greenhouse pulls from

This file is a flat list of companies whose Greenhouse careers board the agent
should scrape directly (free, full job descriptions, no API key). It ships
with the original author's target list — replace it with your own:

```json
[
  { "name": "Anthropic", "provider": "greenhouse", "slug": "anthropic" },
  { "name": "Figma", "provider": "greenhouse", "slug": "figma" }
]
```

To find a company's `slug`: visit their careers page and look for a link to
`boards.greenhouse.io/<slug>` or `job-boards.greenhouse.io/<slug>` — that's the
Greenhouse-hosted board and `<slug>` is what goes in the file. Not every
company uses Greenhouse; ones that don't just won't have a working slug (the
agent skips a 404'd board and logs a warning rather than failing the run).

### `config/jsearch.json` — JSearch's schedule and query shape

```json
{
  "cadence": ["mon", "wed", "fri"],
  "datePosted": "week",
  "maxRequestsPerRun": 15,
  "minReserve": 20,
  "locations": ["remote", "Seattle, WA", "US"]
}
```

- `cadence` — which days JSearch runs. Greenhouse automatically runs on the
  *other* days, so the two sources never compete for the same day's analysis
  budget.
- `maxRequestsPerRun` / `minReserve` — guard JSearch's limited monthly quota
  (RapidAPI's free JSearch tier is 100 requests/month); tune these down if
  you're on a smaller plan.
- `locations` — JSearch's own location search terms, distinct from
  `LOCATION_PRIORITY` (which only affects how results are *bucketed* for
  analysis, not what's searched for).

---

## Configuration reference

All configuration lives in `.env.local`. Required variables are validated at
startup — the app will refuse to run with a clear error if any are missing.

### Required

| Variable            | Description                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`      | Postgres connection string, e.g. `postgresql://jobagent:jobagent123@localhost:5433/job_search_agent` |
| `CLAUDE_API_KEY`    | Your Anthropic API key (must start with `sk-ant-`)                |
| `RESUME_PATH`       | Path to your résumé PDF (e.g. `./resume.pdf`)                      |
| `MAILGUN_API_KEY`   | Mailgun API key (required even if you don't use the digest)       |
| `MAILGUN_DOMAIN`    | Mailgun sending domain                                             |
| `MAILGUN_BASE_URL`  | Mailgun API base URL (`https://api.mailgun.net` or the EU variant) |
| `RECIPIENT_EMAIL`   | Where the weekly digest is sent                                   |

### Tailor it to your search

These shape what the agent looks for and how it reasons. All are optional with
sensible defaults — see [Making it yours](#making-it-yours) above for the
full picture, including the two JSON config files.

| Variable                   | Default              | Description                                                    |
| -------------------------- | --------------------- | ---------------------------------------------------------------- |
| `JOB_TITLES`               | `Senior Software Engineer` | Comma-separated titles to search for                    |
| `PREFERRED_TECHNICAL_STACK`| —                    | Technologies you want to work with                            |
| `YEARS_EXPERIENCE`         | `0`                  | Used to calibrate seniority fit                               |
| `PREFERRED_COMPANY_STAGE`  | —                    | e.g. `scale-up,enterprise`                                    |
| `USER_CONTEXT`             | —                    | Free-text context injected into every prompt (e.g. "I want to move into platform/infra roles") |
| `LOCATION_PRIORITY`        | `remote,washington,other` | Location buckets, highest priority first                 |
| `LOCATION_KEYWORDS_*`      | (see `.env.example`) | Keywords that map a posting's location into each bucket        |

### Claude & cost

| Variable                  | Default             | Description                                              |
| -------------------------- | -------------------- | --------------------------------------------------------- |
| `CLAUDE_MODEL`             | `claude-opus-4-7`   | Any Claude model ID; use a smaller model to cut cost    |
| `CLAUDE_MAX_TOKENS`        | `4096`              | Max output tokens per call (1–32000)                    |
| `ANALYSIS_DESC_MAX_CHARS`  | `3500`              | Max characters of a job description sent to Claude, after boilerplate (benefits/EEO/etc.) is stripped out |
| `USE_BATCH_API`            | `false`             | Submit a day's jobs via the Batch API for lower cost — requires running the poll step separately (see [How it works](#how-it-works)) |

### Learning & privacy

| Variable                       | Default | Description                                              |
| ------------------------------- | ------- | ---------------------------------------------------------- |
| `ENABLE_PII_REDACTION`         | `true`  | Strip PII from the résumé before any processing          |
| `ADDITIONAL_REDACTION_PATTERNS`| —       | Extra comma-separated regexes to redact                  |
| `ENABLE_PATTERN_LEARNING`      | `true`  | Let the agent accumulate and apply memory                |
| `PATTERN_CONFIDENCE_THRESHOLD` | `0.5`   | Minimum confidence for a pattern to influence scoring    |
| `AGENT_MEMORY_RETENTION_DAYS`  | `90`    | How long learned patterns persist                        |

---

## Usage

### Commands

| Command             | What it does                                                       |
| -------------------- | --------------------------------------------------------------------- |
| `npm run agent`      | Run one full agent cycle (fetch, analyze, learn, store)           |
| `npm start`          | Start the REST API on port 3001 (the dashboard's backend)         |
| `npm run digest`     | Send the weekly email digest now                                   |
| `npx ts-node src/poll-batch.ts` | Complete any pending Batch API runs (only needed if `USE_BATCH_API=true`) |
| `npm test`           | Run the test suite                                                 |
| `cd dashboard && npm run dev` | Start the dashboard on port 3000                        |

### Day-to-day flow

1. Let the agent run each morning (see scheduling below).
2. Open the dashboard, review **Strong matches**, and **Save** the ones you like
   or **Hide** the ones you don't.
3. Click **Generate cover letter** on a job you're applying to — it's drafted
   on demand from your résumé and that job's analysis, not pre-generated for
   every job.
4. When you apply, mark the job as applied — the agent weights your applications
   heavily when scoring future jobs, so its recommendations sharpen over time.
5. Track each application's status (interview / offer / rejected) on the
   Applications page.

### Scheduling

**GitHub Actions** (`.github/workflows/run-agent.yml`) is the built-in option —
it runs `npm run agent` daily without depending on your own machine being
awake. To use it: add every variable `.env.local` needs as a repository secret
(**Settings → Secrets and variables → Actions**) and reference it from the
workflow's `env:` block — the exact set must match whatever
[Configuration](#configuration-reference) above requires, since the agent
validates its config the same way regardless of where it runs. You can trigger
it manually from the Actions tab (`workflow_dispatch`) to test before relying
on the schedule.

**Local cron** is the alternative if you'd rather run it on your own machine.
`.env.local` is loaded automatically by the app itself (via `dotenv`), so
cron just needs to `cd` into the repo and run the npm script — but cron does
**not** inherit your shell's `PATH`, so a bare `npm`/`node` call that works
fine when you test it by hand can fail silently under cron. Set `PATH`
explicitly:

```cron
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin

0 8 * * *   cd /path/to/job-search-agent && npm run agent   >> logs/agent.log 2>&1
0 18 * * 0  cd /path/to/job-search-agent && npm run digest  >> logs/digest.log 2>&1
```

(Adjust the `PATH` to wherever `which npm` points on your machine.)

Note that local cron only fires if the machine is on and awake at the
scheduled time — a laptop asleep at 8 AM simply skips that run silently.
GitHub Actions doesn't have this failure mode.

---

## Project structure

```
src/
  agent/            Shared in-memory context for a run
  config/           Env-var loading/validation, plus companies.json + jsearch.json loaders
  db/               Postgres client, schema, and repositories
  services/
    agent.service.ts           The 7-step daily loop
    resume.service.ts          PII redaction + profile extraction
    claude-analysis.service.ts Per-job scoring and on-demand cover letters (with prompt caching)
    cover-letter.service.ts    Cover-letter generation, called only from the API route
    digest.service.ts          Weekly email digest
    job-fetchers/               JSearch + Greenhouse (ATS) integrations
  routes/           Express REST API consumed by the dashboard
  run-agent.ts      Entry point for a single agent run
  poll-batch.ts     Completes pending Batch API runs
  send-digest.ts    Entry point for the email digest
config/
  companies.json    Greenhouse boards to scrape — edit this to target your own companies
  jsearch.json      JSearch cadence, locations, and quota guard
dashboard/          React + Vite + Tailwind front end
.github/workflows/  GitHub Actions schedule for the daily run
```

---

## A note on this project

This started as a personal tool built around one job search (Senior/Staff
software-engineering roles), so some defaults reflect that. Everything that
matters — target titles, tech stack, locations, seniority, which companies get
scraped, and the free-text context you give Claude — is configurable, so it can
be pointed at a very different search. Contributions and forks are welcome.
