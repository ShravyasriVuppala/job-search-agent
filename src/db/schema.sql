-- Job Search Agent — Database Schema
-- Run once against an empty database:
--   psql -d job_search_agent -f src/db/schema.sql
-- NEVER store unredacted PII (phone, email, address, SSN, DOB, references)

-- ============================================================
-- resume_metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS resume_metadata (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Redacted profile fields (no PII)
  years_experience  INT,
  technologies      TEXT[],
  companies         TEXT[],
  education_level   VARCHAR(255),
  certifications    TEXT[],
  soft_skills       TEXT[],

  -- Integrity
  resume_hash       VARCHAR(255) NOT NULL,
  resume_redacted   TEXT         NOT NULL, -- Full redacted text (no PII)

  -- Lifecycle
  loaded_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_verified_at  TIMESTAMP,
  is_current        BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Only one active resume at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_metadata_current
  ON resume_metadata (is_current)
  WHERE is_current = TRUE;

-- ============================================================
-- jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source           VARCHAR(50) NOT NULL,
  external_id      TEXT        NOT NULL, -- JSearch job_id can exceed 255 chars (opaque encoded token)
  title            TEXT        NOT NULL,
  company          TEXT        NOT NULL,
  description      TEXT        NOT NULL,
  location         TEXT,
  location_category VARCHAR(50),
  salary_min       INTEGER,
  salary_max       INTEGER,
  salary_currency  VARCHAR(10),
  apply_url        TEXT        NOT NULL UNIQUE,
  posted_at        TIMESTAMP,
  fetched_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Recruiter / company info (from JSearch API, all nullable)
  -- Free text sourced from a third-party API with no length guarantee — TEXT, not VARCHAR,
  -- to match apply_url/company_hiring_url and avoid rejecting an otherwise-valid batch (see
  -- fix/job-insert-varchar-overflow: one oversized field failed the whole saveJobs() batch).
  recruiter_name   TEXT,
  recruiter_email  TEXT,
  company_hiring_url TEXT,
  company_size     VARCHAR(50),
  company_website  TEXT,

  created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- For existing databases, run:
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recruiter_name TEXT;
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recruiter_email TEXT;
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_hiring_url TEXT;
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_size VARCHAR(50);
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_website TEXT;

-- fix/job-insert-varchar-overflow: widen columns populated from external API free text
-- (VARCHAR(255) was silently failing the entire fetch batch when JSearch returned an
-- oversized title/company/location/recruiter/website value):
-- ALTER TABLE jobs ALTER COLUMN title TYPE TEXT;
-- ALTER TABLE jobs ALTER COLUMN company TYPE TEXT;
-- ALTER TABLE jobs ALTER COLUMN location TYPE TEXT;
-- ALTER TABLE jobs ALTER COLUMN recruiter_name TYPE TEXT;
-- ALTER TABLE jobs ALTER COLUMN recruiter_email TYPE TEXT;
-- ALTER TABLE jobs ALTER COLUMN company_website TYPE TEXT;
--
-- Follow-up: the actual field JSearch was overflowing turned out to be external_id
-- (job_id), not the columns above — its opaque encoded token regularly exceeds 255
-- chars. Confirmed via the per-job error logging added in the same fix:
-- ALTER TABLE jobs ALTER COLUMN external_id TYPE TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_source_external_id
  ON jobs (source, external_id);
CREATE INDEX IF NOT EXISTS idx_jobs_location_category
  ON jobs (location_category);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active
  ON jobs (is_active);

-- ============================================================
-- claude_analysis
-- ============================================================
CREATE TABLE IF NOT EXISTS claude_analysis (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID        NOT NULL UNIQUE REFERENCES jobs (id) ON DELETE CASCADE,

  -- Scores
  relevance_score     NUMERIC(5,2) NOT NULL,
  interview_chance    NUMERIC(5,2) NOT NULL,
  location_category   VARCHAR(50)  NOT NULL,
  overall_category    VARCHAR(50)  NOT NULL,  -- 'auto-flag' | 'needs-review' | 'skip'

  -- Reasoning
  relevance_reasoning TEXT,
  insights            TEXT,
  cover_letter_draft  TEXT,
  matched_patterns    TEXT[],

  -- Staleness (set TRUE when resume is updated)
  is_stale            BOOLEAN     NOT NULL DEFAULT FALSE,
  stale_reason        VARCHAR(100),

  analyzed_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_claude_analysis_overall_category
  ON claude_analysis (overall_category);
CREATE INDEX IF NOT EXISTS idx_claude_analysis_is_stale
  ON claude_analysis (is_stale);
CREATE INDEX IF NOT EXISTS idx_claude_analysis_matched_patterns
  ON claude_analysis USING GIN (matched_patterns);

-- ============================================================
-- agent_memory
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_memory (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pattern
  pattern_name         VARCHAR(255) NOT NULL,
  pattern_type         VARCHAR(50)  NOT NULL, -- 'company_success' | 'tech_preference' | 'location_trend'
  pattern_data         JSONB        NOT NULL,
  confidence_score     NUMERIC(3,2) NOT NULL, -- 0.00 to 1.00

  -- Lifecycle
  first_observed_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_observed_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observation_count    INT          NOT NULL DEFAULT 1,

  -- Strategy
  recommendations      TEXT,
  next_strategy_focus  TEXT,

  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memory_pattern
  ON agent_memory (pattern_name);
CREATE INDEX IF NOT EXISTS idx_agent_memory_confidence
  ON agent_memory (confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_last_observed
  ON agent_memory (last_observed_at);

-- ============================================================
-- applications
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             UUID        NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  claude_analysis_id UUID        REFERENCES claude_analysis (id) ON DELETE SET NULL,

  applied_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status             VARCHAR(50) NOT NULL DEFAULT 'applied',
    -- 'applied' | 'interview_scheduled' | 'rejected' | 'offer' | 'archived'
  cover_letter_used  TEXT,
  user_notes         TEXT,

  created_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_unique_job
  ON applications (job_id);
CREATE INDEX IF NOT EXISTS idx_applications_status
  ON applications (status);

-- ============================================================
-- job_interactions
-- ============================================================
CREATE TABLE IF NOT EXISTS job_interactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  interaction_type VARCHAR(20) NOT NULL CHECK (interaction_type IN ('saved', 'not_interested')),
  created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (job_id, interaction_type)
);

CREATE INDEX IF NOT EXISTS idx_job_interactions_job_id
  ON job_interactions (job_id);
CREATE INDEX IF NOT EXISTS idx_job_interactions_type
  ON job_interactions (interaction_type);

-- For existing databases, run:
-- CREATE TABLE IF NOT EXISTS job_interactions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, interaction_type VARCHAR(20) NOT NULL CHECK (interaction_type IN ('saved', 'not_interested')), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (job_id, interaction_type));
-- CREATE INDEX IF NOT EXISTS idx_job_interactions_job_id ON job_interactions (job_id);
-- CREATE INDEX IF NOT EXISTS idx_job_interactions_type ON job_interactions (interaction_type);

-- ============================================================
-- agent_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_runs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status            VARCHAR(20) NOT NULL DEFAULT 'running',
    -- 'running' | 'completed' | 'failed'
  started_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at      TIMESTAMP,
  duration_seconds  INT,

  -- Per-run metrics
  jobs_fetched      INT         NOT NULL DEFAULT 0,
  jobs_analyzed     INT         NOT NULL DEFAULT 0,
  auto_flagged      INT         NOT NULL DEFAULT 0,
  maybe_flagged     INT         NOT NULL DEFAULT 0,
  skipped           INT         NOT NULL DEFAULT 0,
  patterns_upserted INT         NOT NULL DEFAULT 0,
  tokens_input      INT         NOT NULL DEFAULT 0,
  tokens_output     INT         NOT NULL DEFAULT 0,

  -- Error tracking
  error_message     TEXT,

  created_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at
  ON agent_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status
  ON agent_runs (status);

-- ============================================================
-- batch_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS batch_runs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id       TEXT        NOT NULL UNIQUE,  -- Anthropic's batch ID
  status         VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- 'pending' | 'completed' | 'failed'
  job_ids        TEXT[]      NOT NULL,
  jobs_fetched   INT         NOT NULL DEFAULT 0,
  run_id         UUID        REFERENCES agent_runs(id) ON DELETE SET NULL,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_runs_status
  ON batch_runs (status);
CREATE INDEX IF NOT EXISTS idx_batch_runs_submitted_at
  ON batch_runs (submitted_at DESC);

-- For existing databases, run:
-- CREATE TABLE IF NOT EXISTS batch_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), batch_id TEXT NOT NULL UNIQUE, status VARCHAR(20) NOT NULL DEFAULT 'pending', job_ids TEXT[] NOT NULL, jobs_fetched INT NOT NULL DEFAULT 0, run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL, submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ, error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
-- CREATE INDEX IF NOT EXISTS idx_batch_runs_status ON batch_runs (status);
-- CREATE INDEX IF NOT EXISTS idx_batch_runs_submitted_at ON batch_runs (submitted_at DESC);

-- For existing databases, run:
-- CREATE TABLE IF NOT EXISTS agent_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), status VARCHAR(20) NOT NULL DEFAULT 'running', started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMP, duration_seconds INT, jobs_fetched INT NOT NULL DEFAULT 0, jobs_analyzed INT NOT NULL DEFAULT 0, auto_flagged INT NOT NULL DEFAULT 0, maybe_flagged INT NOT NULL DEFAULT 0, skipped INT NOT NULL DEFAULT 0, patterns_upserted INT NOT NULL DEFAULT 0, tokens_input INT NOT NULL DEFAULT 0, tokens_output INT NOT NULL DEFAULT 0, error_message TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS tokens_input INT NOT NULL DEFAULT 0;
-- ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS tokens_output INT NOT NULL DEFAULT 0;
-- CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON agent_runs (started_at DESC);
-- CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs (status);
