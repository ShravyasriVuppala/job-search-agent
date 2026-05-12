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
  external_id      VARCHAR(255) NOT NULL,
  title            VARCHAR(255) NOT NULL,
  company          VARCHAR(255) NOT NULL,
  description      TEXT        NOT NULL,
  location         VARCHAR(255),
  location_category VARCHAR(50),
  salary_min       INTEGER,
  salary_max       INTEGER,
  salary_currency  VARCHAR(10),
  apply_url        TEXT        NOT NULL UNIQUE,
  posted_at        TIMESTAMP,
  fetched_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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