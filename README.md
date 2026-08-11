# Job Search Agent

An autonomous, AI-powered job search assistant. Every day it fetches fresh job
postings, has Claude read each one against **your** redacted résumé, sorts them
into "strong match / worth a look / skip," learns from the jobs you actually
apply to, and surfaces everything in a dashboard so you spend your time applying
instead of scrolling job boards.

It is built around a simple idea: instead of hardcoded rules like *"if the title
contains 'Senior' and the salary is above X, flag it,"* the agent gives Claude
your résumé, its own accumulated memory, and each job description, and lets the
model reason about fit the way a thoughtful recruiter would.

> **Privacy first:** your résumé is redacted (SSN, phone, email, ZIP, date of
> birth, references) *before* anything is stored in the database, sent to the
> Claude API, or written to logs. The raw file never leaves your machine.

---

## What it does

- **Fetches jobs** daily from job-board APIs (JSearch via RapidAPI) filtered by
  your target titles.
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
FETCH    → pull new postings from the job APIs
ANALYZE  → Claude scores each job against résumé + memory + strategy
LEARN    → Claude distills patterns from today's results and your applications
STORE    → persist analyses and updated memory to Postgres
DIGEST   → (weekly) email the top matches
```

To keep costs down, the static part of each prompt (instructions + your résumé +
learned patterns) is marked for **prompt caching**, and an optional **Batch API**
mode submits all of a day's jobs in one request. The project's own estimate for a
~50-job daily run is roughly **$0.26/day**.

### Tech stack

| Layer      | Technology                                              |
| ---------- | ------------------------------------------------------- |
| Backend    | TypeScript, Node.js, Express (REST API)                 |
| AI         | Claude (`@anthropic-ai/sdk`) with prompt caching        |
| Database   | PostgreSQL (via Docker)                                 |
| Jobs API   | JSearch (RapidAPI)                                       |
| Email      | Mailgun                                                 |
| Dashboard  | React, Vite, Tailwind CSS                               |

---

## Prerequisites

- **Node.js 20+** and npm
- **Docker** (for the PostgreSQL database)
- A **Claude API key** — <https://console.anthropic.com/>
- A **RapidAPI key** with a JSearch subscription — <https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch>
- *(Optional, only for email digests)* a **Mailgun account** (API key + sending domain)
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

### 5. Run it

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

## Configuration

All configuration lives in `.env.local`. Required variables are validated at
startup — the app will refuse to run with a clear error if any are missing.

### Required

| Variable            | Description                                                        |
| ------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`      | Postgres connection string, e.g. `postgresql://jobagent:jobagent123@localhost:5433/job_search_agent` |
| `CLAUDE_API_KEY`    | Your Anthropic API key (must start with `sk-ant-`)                |
| `RESUME_PATH`       | Path to your résumé PDF (e.g. `./resume.pdf`)                      |
| `MAILGUN_API_KEY`   | Mailgun API key (required even if you don't use the digest)       |
| `MAILGUN_DOMAIN`    | Mailgun sending domain                                             |
| `MAILGUN_BASE_URL`  | Mailgun API base URL (`https://api.mailgun.net` or the EU variant) |
| `RECIPIENT_EMAIL`   | Where the weekly digest is sent                                   |

### Tailor it to your search

These shape what the agent looks for and how it reasons. All are optional with
sensible defaults.

| Variable                   | Default              | Description                                                    |
| -------------------------- | -------------------- | ------------------------------------------------------------- |
| `JOB_TITLES`               | `Senior Software Engineer` | Comma-separated titles to search for                    |
| `PREFERRED_TECHNICAL_STACK`| —                    | Technologies you want to work with                            |
| `YEARS_EXPERIENCE`         | `0`                  | Used to calibrate seniority fit                               |
| `PREFERRED_COMPANY_STAGE`  | —                    | e.g. `scale-up,enterprise`                                    |
| `EXCLUDE_KEYWORDS`         | —                    | Skip postings containing these                                |
| `USER_CONTEXT`             | —                    | Free-text context injected into every prompt (e.g. "I want to move into platform/infra roles") |
| `LOCATION_PRIORITY`        | `remote,washington,other` | Location buckets, highest priority first                 |
| `LOCATION_KEYWORDS_*`      | (see `.env.example`) | Keywords that map a posting's location into each bucket        |

### Claude & cost

| Variable            | Default             | Description                                              |
| ------------------- | ------------------- | ------------------------------------------------------- |
| `CLAUDE_MODEL`      | `claude-opus-4-7`   | Any Claude model ID; use a smaller model to cut cost    |
| `CLAUDE_MAX_TOKENS` | `4096`              | Max output tokens per call (1–32000)                    |
| `USE_BATCH_API`     | `false`             | Submit a day's jobs via the Batch API for lower cost    |

### Learning & privacy

| Variable                       | Default | Description                                              |
| ------------------------------ | ------- | -------------------------------------------------------- |
| `ENABLE_PII_REDACTION`         | `true`  | Strip PII from the résumé before any processing          |
| `ADDITIONAL_REDACTION_PATTERNS`| —       | Extra comma-separated regexes to redact                  |
| `ENABLE_PATTERN_LEARNING`      | `true`  | Let the agent accumulate and apply memory                |
| `PATTERN_CONFIDENCE_THRESHOLD` | `0.5`   | Minimum confidence for a pattern to influence scoring    |
| `AGENT_MEMORY_RETENTION_DAYS`  | `90`    | How long learned patterns persist                        |

---

## Usage

### Commands

| Command             | What it does                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `npm run agent`     | Run one full agent cycle (fetch, analyze, learn, store)           |
| `npm start`         | Start the REST API on port 3001 (the dashboard's backend)         |
| `npm run digest`    | Send the weekly email digest now                                  |
| `npm test`          | Run the test suite                                                 |
| `cd dashboard && npm run dev` | Start the dashboard on port 3000                        |

### Day-to-day flow

1. Let the agent run each morning (see scheduling below).
2. Open the dashboard, review **Strong matches**, and **Save** the ones you like
   or **Hide** the ones you don't.
3. When you apply, mark the job as applied — the agent weights your applications
   heavily when scoring future jobs, so its recommendations sharpen over time.
4. Track each application's status (interview / offer / rejected) on the
   Applications page.

### Scheduling (optional)

To run the agent automatically every morning and email a weekly digest, the
`scripts/` directory contains cron-friendly wrappers that load your `.env.local`
and run the appropriate command:

```bash
# Example crontab: run the agent at 8 AM daily, send the digest Sunday at 6 PM
0 8 * * *   /path/to/job-search-agent/scripts/run-agent.sh
0 18 * * 0  /path/to/job-search-agent/scripts/run-digest.sh
```

There's also a GitHub Actions workflow (`.github/workflows/run-agent.yml`) that
runs the agent daily using repository secrets, if you'd rather run it in CI than
on your own machine.

---

## Project structure

```
src/
  agent/            Shared in-memory context for a run
  config/           Env-var loading and validation
  db/               Postgres client, schema, and repositories
  services/
    agent.service.ts          The 7-step daily loop
    resume.service.ts         PII redaction + profile extraction
    claude-analysis.service.ts Per-job scoring (with prompt caching)
    digest.service.ts         Weekly email digest
    job-fetchers/             Job-board API integrations (JSearch active)
  routes/           Express REST API consumed by the dashboard
  run-agent.ts      Entry point for a single agent run
  send-digest.ts    Entry point for the email digest
dashboard/          React + Vite + Tailwind front end
scripts/            Cron wrappers for scheduled runs
```

---

## A note on this project

This started as a personal tool built around one job search (Senior/Staff
software-engineering roles), so some defaults reflect that. Everything that
matters — target titles, tech stack, locations, seniority, and the free-text
context you give Claude — is configurable, so it can be pointed at a very
different search. Contributions and forks are welcome.
