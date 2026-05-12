# Job Search Agent - Specification Document (Persistent Autonomous Agent + PII Redaction)

**Version:** 1.0  
**Date:** May 11, 2026  
**Status:** Approved for Implementation  
**Architecture:** Long-Running Autonomous Agent with Persistent Memory + PII Redaction

---

## Table of Contents

1. [System Overview](#system-overview)
2. [System Architecture](#system-architecture)
3. [Configuration Specification](#configuration-specification)
4. [Data Model Specification](#data-model-specification)
5. [Resume Handling & PII Redaction](#resume-handling--pii-redaction)
6. [Claude API Autonomous Agent](#claude-api-autonomous-agent)
7. [Agentic Loop Specification](#agentic-loop-specification)
8. [Security Specification](#security-specification)
9. [API Specification](#api-specification)
10. [Workflow Specification](#workflow-specification)
11. [External Integrations](#external-integrations)

---

## System Overview

**Purpose:** A long-running autonomous job search agent that maintains persistent context, learns from experience, makes intelligent decisions, and improves over time. The agent protects user privacy through PII redaction while leveraging rich contextual understanding for better job matching.

**Key Characteristics:**
- **Persistent:** Agent runs continuously (or maintains state between scheduled runs)
- **Autonomous:** Makes decisions based on reasoning, not pre-defined rules
- **Learning:** Remembers patterns and improves recommendations over weeks
- **Secure:** Redacts all PII (phone, email, address, SSN) before processing
- **Intelligent:** Uses rich context (resume, memory, patterns) to make smart decisions
- **Efficient:** Loads resume once, reuses for all analyses

**Key Users:**
- Primary: Software engineers wanting AI-driven autonomous job discovery with privacy protection
- Secondary: Anyone learning autonomous agent architecture with security best practices

**Key Constraints:**
- All intelligence driven by Claude API (no hard-coded rules)
- Autonomous decision-making with persistent memory
- PII redaction mandatory (phone, email, address, etc.)
- Location categorization primary dimension (remote, washington, others)
- Reusable and fork-able by others
- Cost-efficient (~$7.80/month for Claude API usage)

---

## System Architecture

```
┌────────────────────────────────────────────────────────────┐
│        Long-Running Autonomous Agent Service               │
│        (Persistent Memory + PII Redaction)                 │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │   Claude API (Autonomous Agent Brain)               │   │
│  │   - Uses tool_use (function calling)                │   │
│  │   - Reasons about strategy                          │   │
│  │   - Makes adaptive decisions                        │   │
│  │   - Learns from observations                        │   │
│  └────────────────┬────────────────────────────────────┘   │
│                   │ (tool_use, streaming)                  │
│     ┌─────────────┼──────────────┬────────────────┐        │
│     │             │              │                │        │
│  ┌──▼──────┐  ┌──▼─────────┐ ┌──▼──┐         ┌──▼──┐       │
│  │Job APIs │  │PostgreSQL  │ │Agent│         │SendG│       │
│  │(Fetch)  │  │(Persistent)│ │Mem  │         │Grid │       │
│  └─────────┘  └────────────┘ └─────┘         └─────┘       │
│                                                            │
│  Agent Context (In Memory):                                │
│  ├─ Resume (REDACTED, no PII)                              │
│  ├─ Agent Memory (patterns, learnings)                     │
│  ├─ Current Strategy                                       │
│  ├─ Success Patterns                                       │
│  └─ Historical Context                                     │
│                                                            │
│  Daily Triggers (8 AM PT):                                 │
│  ├─ Resume already in memory ✓                             │
│  ├─ Agent memory loaded ✓                                  │
│  ├─ Fetch new jobs                                         │
│  ├─ Analyze using rich context                             │
│  ├─ Learn new patterns                                     │
│  └─ Update persistent memory                               │
│                                                            │
│  GitHub Actions (Scheduler):                               │
│  └─ Triggers agent at 8 AM PT daily                        │
│                                                            │
│  React Dashboard:                                          │
│  └─ Shows recommendations (updated daily, 8 AM)            │
│                                                            │
│  SendGrid:                                                 │
│  └─ Weekly digest (Sunday 6 PM, no PII)                    │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Service Model

**Not:** Spawn process → analyze → exit → repeat  
**YES:** Long-running service with persistent context

```
Service Lifecycle:

INITIALIZATION (First Run):
  └─ Load resume PDF
  └─ Redact PII
  └─ Keep in memory (never deleted)
  └─ Load agent memory from DB
  └─ Ready to operate

DAILY LOOP (8 AM each day):
  ├─ Resume in memory (still there)
  ├─ Agent memory in memory (still there)
  ├─ Load latest patterns from DB
  ├─ Fetch ~40-50 new jobs
  ├─ Analyze (using resume + memory context)
  ├─ Learn new patterns
  ├─ Update persistent memory in DB
  └─ Wait for next day

CONTINUOUS IMPROVEMENT:
  Day 1: Learn "User likes Company A"
  Day 2: Prioritize Company A (confidence: 40%)
  Day 3: User success with Company A (confidence: 60%)
  Day 4: Strongly prioritize Company A (confidence: 80%)
  Week 2: Agent strategy fully adapted
```

---

## Configuration Specification

### User Profile

```env
# Resume (redacted on load, never modified)
RESUME_PATH=./resume.pdf

# Target roles
JOB_TITLES=Senior Software Engineer,Staff Software Engineer,Full-stack Java Engineer

# Location preferences
LOCATION_PRIORITY=remote,washington,others
```

### Agent Parameters

```env
# Agent reasoning configuration
YEARS_EXPERIENCE=7
PREFERRED_COMPANY_STAGE=scale-up,enterprise
EXCLUDE_KEYWORDS=
PREFERRED_TECHNICAL_STACK=Java,Spring Boot,Kafka,Elasticsearch,PostgreSQL,Docker

# Learning configuration
AGENT_MEMORY_RETENTION_DAYS=90
ENABLE_PATTERN_LEARNING=true
PATTERN_CONFIDENCE_THRESHOLD=0.5
```

### Schedule

```env
# Single daily run (comprehensive analysis)
JOB_FETCH_FREQUENCY=once_daily
JOB_FETCH_TIME=08:00
JOB_FETCH_TIMEZONE=America/Los_Angeles

# Weekly digest
WEEKLY_DIGEST_DAY=sunday
WEEKLY_DIGEST_TIME=18:00
WEEKLY_DIGEST_TIMEZONE=America/Los_Angeles
RECIPIENT_EMAIL=your-email@example.com
```

### PII Redaction

```env
# Redaction enabled (MANDATORY)
ENABLE_PII_REDACTION=true

# Redaction patterns (built-in defaults)
REDACT_PHONE_NUMBERS=true
REDACT_EMAIL_ADDRESSES=true
REDACT_ADDRESSES=true
REDACT_SSN=true
REDACT_DOB=true
REDACT_REFERENCES=true

# Custom redaction patterns (optional, comma-separated regex strings)
# Example: ADDITIONAL_REDACTION_PATTERNS=\bEmployee ID\b,\bBadge \d+\b
ADDITIONAL_REDACTION_PATTERNS=
```

### External Services

```env
# Claude API
CLAUDE_API_KEY=sk-ant-...

# SendGrid
SENDGRID_API_KEY=SG.xxx...

# Job APIs
RAPIDAPI_KEY=your_rapidapi_key
```

### Database

```env
DATABASE_URL=postgresql://user:password@localhost:5432/job_search_agent
```

---

## Data Model Specification

### Database Schema

#### Table: `resume_metadata`
```sql
CREATE TABLE resume_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Resume Info (Redacted)
  years_experience INT,
  technologies TEXT[],                -- ["Java", "Spring Boot", "Kafka"]
  companies TEXT[],                   -- ["Google", "Microsoft"]
  education_level VARCHAR(255),       -- "BS Computer Science"
  certifications TEXT[],
  soft_skills TEXT[],
  
  -- Integrity Check
  resume_hash VARCHAR(255),           -- SHA256 of redacted resume
  resume_redacted TEXT,               -- Full redacted resume text
  
  -- Lifecycle
  loaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_verified_at TIMESTAMP,
  is_current BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Note: NEVER store phone, email, address, SSN, DOB, or references
```

#### Table: `jobs`
```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  company VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(255),
  location_category VARCHAR(50),
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency VARCHAR(10),
  apply_url TEXT NOT NULL UNIQUE,
  posted_at TIMESTAMP,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_jobs_source_external_id ON jobs(source, external_id);
CREATE INDEX idx_jobs_location_category ON jobs(location_category);
CREATE INDEX idx_jobs_is_active ON jobs(is_active);
```

#### Table: `claude_analysis`
```sql
CREATE TABLE claude_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) UNIQUE,
  
  -- Agent Analysis
  relevance_score NUMERIC(5,2) NOT NULL,
  interview_chance NUMERIC(5,2) NOT NULL,
  location_category VARCHAR(50) NOT NULL,
  overall_category VARCHAR(50) NOT NULL,
  
  -- Reasoning
  relevance_reasoning TEXT,
  insights TEXT,
  cover_letter_draft TEXT,
  
  -- Pattern Matching
  matched_patterns TEXT[],
  
  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_claude_analysis_overall_category ON claude_analysis(overall_category);
CREATE INDEX idx_claude_analysis_matched_patterns ON claude_analysis USING GIN(matched_patterns);
```

#### Table: `agent_memory` (NEW - Persistent Learning)
```sql
CREATE TABLE agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Pattern Recognition
  pattern_name VARCHAR(255),
  pattern_type VARCHAR(50),          -- "company_success", "tech_preference", "location_trend", etc.
  pattern_data JSONB,
  confidence_score NUMERIC(3,2),     -- 0.00 to 1.00
  
  -- Lifecycle
  first_observed_at TIMESTAMP,
  last_observed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  observation_count INT DEFAULT 1,
  
  -- Agent Decisions
  recommendations TEXT,
  next_strategy_focus TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_agent_memory_pattern ON agent_memory(pattern_name);
CREATE INDEX idx_agent_memory_confidence ON agent_memory(confidence_score DESC);
CREATE INDEX idx_agent_memory_last_observed ON agent_memory(last_observed_at);
```

#### Table: `applications`
```sql
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id),
  claude_analysis_id UUID REFERENCES claude_analysis(id),
  
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'applied',
  cover_letter_used TEXT,
  user_notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_applications_unique_job ON applications(job_id);
CREATE INDEX idx_applications_status ON applications(status);
```

---

## Resume Handling & PII Redaction

### Overview

Resume is loaded **once at agent startup**, **redacted**, **kept in agent memory**, and **never deleted** until agent shutdown. This ensures:
- ✅ True persistent autonomous agent
- ✅ No re-parsing (efficient)
- ✅ PII never stored or sent
- ✅ Rich context for analysis

### Redaction Strategy

**Sensitive Data (REDACT):**
- ❌ Phone numbers → `[REDACTED_PHONE]`
- ❌ Email addresses → `[REDACTED_EMAIL]`
- ❌ Home addresses → `[REDACTED_ADDRESS]`
- ❌ ZIP codes → `[REDACTED_ZIP]`
- ❌ Social Security Numbers → `[REDACTED_SSN]`
- ❌ Dates of birth → `[REDACTED_DOB]`
- ❌ Reference names/contacts → `[REDACTED_REFERENCES]`
- ❌ Specific locations (if privacy concern)

**Safe Data (KEEP):**
- ✅ Years of experience (e.g., 7)
- ✅ Job titles (e.g., "Senior Engineer")
- ✅ Technologies (e.g., "Java, Spring Boot, Kafka")
- ✅ Company names (e.g., "Google, Microsoft")
- ✅ Education level (e.g., "BS Computer Science")
- ✅ Certifications (e.g., "AWS Solutions Architect")
- ✅ Soft skills (e.g., "Leadership, mentoring")
- ✅ General location (e.g., "Pacific Northwest")

### Implementation

```typescript
// Redaction patterns
const redactionPatterns = {
  phone: /(\d{3})[.\-]?(\d{3})[.\-]?(\d{4})/g,
  email: /[\w\.-]+@[\w\.-]+\.\w+/g,
  zipcode: /\b\d{5}(?:\-\d{4})?\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  dob: /(?:\d{1,2}\/){2}\d{4}|\d{4}-\d{2}-\d{2}/g,
  references: /References:[\s\S]*$/gi
};

function redactResume(resumeText: string): string {
  let redacted = resumeText;
  redacted = redacted.replace(redactionPatterns.phone, '[REDACTED_PHONE]');
  redacted = redacted.replace(redactionPatterns.email, '[REDACTED_EMAIL]');
  redacted = redacted.replace(redactionPatterns.zipcode, '[REDACTED_ZIP]');
  redacted = redacted.replace(redactionPatterns.ssn, '[REDACTED_SSN]');
  redacted = redacted.replace(redactionPatterns.dob, '[REDACTED_DOB]');
  redacted = redacted.replace(redactionPatterns.references, '[REDACTED_REFERENCES]');
  return redacted;
}

// AGENT STARTUP
const resumePDF = fs.readFileSync(RESUME_PATH);
const resumeText = await pdfParse(resumePDF);
const redactedResume = redactResume(resumeText);

// Keep in agent memory (never deleted until shutdown)
agentContext.resume = {
  original_hash: sha256(resumeText),  // Verify integrity
  redacted_text: redactedResume,
  loaded_at: new Date(),
  metadata: {
    years_experience: 7,
    technologies: ["Java", "Spring Boot"],
    companies: ["Google", "Microsoft"]
  }
};

// Save redacted version to DB
await database.saveResumeMetadata({
  resume_hash: sha256(resumeText),
  resume_redacted: redactedResume,
  years_experience: 7,
  technologies: ["Java", "Spring Boot"],
  companies: ["Google", "Microsoft"]
});
```

### Resume Update Detection

When the resume file changes, the agent must:
1. Refresh all in-memory metadata (not just the redacted text)
2. Assess whether the change is minor or major before deciding what to do with learned patterns
3. Mark existing analysis records as stale so the dashboard doesn't show scores from the old profile

```typescript
const currentHash = sha256(fs.readFileSync(RESUME_PATH));
const lastStoredHash = agentContext.resume.original_hash;

if (currentHash !== lastStoredHash) {
  const newResumeText = await pdfParse(fs.readFileSync(RESUME_PATH));
  const newRedacted = redactResume(newResumeText);

  // Gap 1 fixed: re-extract metadata so in-memory profile stays current
  const newMetadata = await extractResumeMetadata(newRedacted); // years_exp, techs, companies, etc.

  agentContext.resume.redacted_text = newRedacted;
  agentContext.resume.original_hash = currentHash;
  agentContext.resume.metadata = newMetadata; // was never updated before

  // Gap 2 fixed: detect magnitude of change before deciding what to do with patterns
  const changeScore = compareResumeMetadata(agentContext.resume.metadata, newMetadata);
  // changeScore: 0.0 = identical, 1.0 = completely different

  if (changeScore > 0.5) {
    // Major change (e.g. new stack, different seniority level, career pivot)
    // Patterns learned against the old profile are no longer trustworthy — reset them
    await database.resetAgentMemory();
    agentContext.memory.patterns = [];
    agentContext.memory.learned_strategy = null;
    agentContext.memory.observations_count = 0;
  } else {
    // Minor change (e.g. added a certification, updated a job title)
    // Patterns are still directionally valid; reduce confidence slightly to reflect uncertainty
    agentContext.memory.patterns = agentContext.memory.patterns.map(p => ({
      ...p,
      confidence: p.confidence * 0.8, // decay by 20%
    }));
    await database.decayPatternConfidence(0.8);
  }

  // Gap 3 fixed: mark existing analysis records as stale
  // so the dashboard won't surface scores calculated against the old resume
  await database.markAnalysisStale();

  // Persist updated metadata
  await database.updateResumeMetadata({
    resume_hash: currentHash,
    resume_redacted: newRedacted,
    ...newMetadata,
  });
}
```

### Resume Change Magnitude

`compareResumeMetadata()` scores the delta between old and new metadata:

| Signal | Weight | Example |
|---------------------------|--------|------------------------------------------|
| Tech stack overlap | 40% | Java→Python = low overlap (major change) |
| Seniority level change | 30% | Senior→Staff = moderate change |
| Years of experience delta | 20% | 5→7 years = minor change |
| Company/industry shift | 10% | Finance→Healthtech = minor change |

A `changeScore > 0.5` triggers a full pattern reset. A `changeScore ≤ 0.5` triggers a confidence decay of 20% on all patterns.

### Stale Analysis Records

The `claude_analysis` table requires an additional column to track staleness:

```sql
ALTER TABLE claude_analysis
  ADD COLUMN is_stale BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN stale_reason VARCHAR(100);

CREATE INDEX idx_claude_analysis_is_stale ON claude_analysis(is_stale);
```

When resume changes are detected, all existing rows are marked stale:
```sql
UPDATE claude_analysis
SET is_stale = TRUE,
    stale_reason = 'resume_updated'
WHERE is_stale = FALSE;
```

The `GET /jobs/recommendations` endpoint must filter these out or surface a banner:
```json
{
  "warning": "Resume was updated. Recommendations are being recalculated and will refresh at next agent run (8 AM PT).",
  "byLocation": {}
}
```

---

## Claude API Autonomous Agent

### Agent Context (In Memory)

```typescript
agentContext = {
  // Resume (loaded once, redacted, persistent)
  resume: {
    redacted_text: "Years: 7\nSkills: Java, Spring...",
    metadata: { years_exp: 7, techs: [...] },
    loaded_at: Date,
    hash: "abc123"
  },
  
  // Agent Memory (loaded from DB at startup, grows over time)
  memory: {
    patterns: [
      {
        name: "company_a_success",
        confidence: 0.85,
        last_observed: Date
      },
      {
        name: "distributed_systems_preference",
        confidence: 0.72,
        last_observed: Date
      }
    ],
    learned_strategy: "Prioritize Company A + distributed systems",
    success_rate: 0.33,
    observations_count: 12
  },
  
  // Current session
  today_strategy: "string",
  jobs_to_analyze: [],
  learnings_from_today: []
};
```

### Agent Tools (Function Calling)

```
Tool 1: observe_context()
  Returns: {
    resume: {...},
    memory: {...},
    recent_applications: [...]
  }

Tool 2: fetch_jobs()
  Returns: 40-50 new jobs

Tool 3: analyze_job(job, context)
  Returns: { score, category, insights, patterns }

Tool 4: categorize_and_prioritize(jobs, strategy)
  Returns: organized jobs by location + priority

Tool 5: learn_pattern(pattern_name, data)
  Returns: { confidence, next_focus }
```

### Agent Reasoning

Claude reasons with full context:
```
Input:
  - Resume (redacted): Years, skills, companies
  - Memory: Learned patterns + strategy
  - Context: Recent applications, success rate
  - New jobs: 40-50 to analyze

Claude thinks:
  "Based on resume (7 years, Java/Spring/Kafka)
   And memory (Company A success, distributed systems preference)
   And context (33% interview rate)
   
   My strategy today:
   1. Strongly prioritize Company A roles
   2. Focus on distributed systems
   3. Explore Washington (not yet tried)
   4. Match seniority to Staff level
   
   For each job:
   - Score relevance (using full context)
   - Tag patterns (if match)
   - Draft cover letter (if high value)
   
   Learn:
   - Any new patterns?
   - Confidence changes?
   - Strategy update?"
```

---

## Agentic Loop Specification

### Daily Run (8 AM PT)

**Duration:** ~5-10 minutes  
**Cost:** ~$0.26/day

```
AGENT STATE (Persistent in memory):
├─ Resume: "Years: 7, Skills: Java, Spring..."
├─ Memory: Patterns + learnings
└─ Strategy: Based on past success

8 AM TRIGGER:
├─ Resume already loaded ✓
├─ Agent memory already loaded ✓
├─ Fresh connection to Claude API

STEP 1: OBSERVE
  Tool: observe_context()
  ├─ Load resume from memory
  ├─ Load agent memory from DB
  ├─ Review recent applications
  ├─ Cost: ~$0.05

STEP 2: ASSESS & PLAN
  Claude reasons:
  ├─ "What's working? (patterns)"
  ├─ "What should I prioritize today?"
  ├─ "What's my strategy?"
  ├─ Cost: ~$0.03

STEP 3: FETCH
  Tool: fetch_jobs()
  ├─ GitHub Jobs: fetch new
  ├─ Stack Overflow: fetch new
  ├─ HN (Algolia): fetch new
  ├─ JSearch: fetch new
  ├─ RemoteOK: fetch new
  ├─ AngelList: fetch new
  ├─ Total: ~40-50 jobs
  └─ Cost: $0 (APIs mostly free)

STEP 4: ANALYZE (for each job)
  Tool: analyze_job(job, resume, memory)
  ├─ Score relevance (0-100)
  ├─ Estimate interview chance (0-100)
  ├─ Categorize: auto-flag / needs-review / skip
  ├─ Tag patterns: "distributed_systems", "company_a"
  ├─ Draft cover letter (if high-value)
  ├─ Total: ~40 jobs
  └─ Cost: ~$0.12 (40 × $0.003 batch)

STEP 5: CATEGORIZE & PRIORITIZE
  Tool: categorize_and_prioritize(jobs, strategy)
  ├─ Group by location: remote, washington, other
  ├─ Sort within groups by strategy + relevance
  ├─ Highlight pattern matches
  └─ Cost: ~$0.04

STEP 6: LEARN
  Tool: learn_pattern()
  ├─ Observe patterns in today's jobs
  ├─ Update confidence scores
  ├─ Identify new patterns
  ├─ Store learnings in DB
  └─ Cost: ~$0.02

COMPLETION:
├─ Store 40-50 analyzed jobs in DB
├─ Update agent_memory table with learnings
├─ Resume stays in memory (never deleted)
├─ Agent memory stays in memory (grows over time)
└─ Ready for tomorrow

TOTAL COST: ~$0.26/day = ~$7.80/month
```

---

## Security Specification

### 1. PII Protection (MANDATORY)

**Before Processing:**
```
Original Resume: "Shravya Kumar, 206-555-1234, shravya@example.com"
         ↓
    REDACTION
         ↓
Processed Resume: "[REDACTED_PHONE], [REDACTED_EMAIL]"
         ↓
Agent memory: Redacted version only
Database: Redacted version only
Claude API: Redacted version only
```

**Rule:** Never persist, transmit, or log unredacted PII.

### 2. Secrets Management

**Development:**
- `.env.local` (gitignored, real values)
- `.env.example` (template, no values)

**Production (GitHub Actions):**
- All secrets in GitHub Secrets
- Never printed in logs
- Environment variables only

### 3. Database Security

**PostgreSQL:**
- Strong password (min 16 chars)
- App user (not admin)
- Least privilege (SELECT, INSERT, UPDATE, DELETE on specific tables)
- SSL/TLS required

**Data:**
- No unredacted resume text
- No phone numbers
- No email addresses
- No addresses
- No SSN
- No DOB

### 4. Input Validation

**Job Descriptions:**
- Sanitize before Claude analysis
- Validate: "Is this a real job posting?"
- Check: Malicious/spam detection

**Claude Prompts:**
- Sanitize user inputs
- Prevent prompt injection
- Validate JSON responses

**Database:**
- Parameterized queries (prevent SQL injection)
- Never string concatenation

### 5. Logging Standards

**DO Log:**
```
logger.info('Agent analyzed 47 jobs')
logger.info('Pattern confidence: 0.85')
logger.info('Strategy updated: prioritize Company A')
```

**DON'T Log:**
```
logger.error('Claude API key: sk-ant-xxx')  ❌
logger.info('Resume content: ' + resume)     ❌
logger.error('DB password: postgres123')     ❌
```

**Pattern:** No secrets, no PII, no sensitive data.

### 6. Error Handling

- Generic errors to users
- Detailed errors in server logs only
- Never expose API keys in errors
- Never expose database credentials
- Never expose user data in error messages

### 7. Data Retention & Privacy

**Data Retention:**
- Keep jobs: 90 days (auto-delete old jobs)
- Keep applications: Forever (user can delete)
- Keep agent memory: 90 days (auto-cleanup old patterns)

**User Rights:**
- Export data: `GET /user/data/export`
- Delete data: `DELETE /user/data`
- Update resume: Replace on disk

### 8. Transport Security

**HTTPS:**
- Always use HTTPS in production (never plain HTTP)
- Redirect all HTTP → HTTPS
- Minimum TLS 1.2

**CORS:**
```javascript
// Allow only your dashboard origin in production
app.use(cors({
  origin: process.env.DASHBOARD_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
```

### 9. Startup Environment Validation

Fail fast if required variables are missing — never start with incomplete config:

```typescript
const REQUIRED_ENV_VARS = [
  'CLAUDE_API_KEY',
  'DATABASE_URL',
  'RESUME_PATH',
  'RECIPIENT_EMAIL',
  'SENDGRID_API_KEY',
];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
```

### 10. GitHub Actions Security

**Workflows:**
- Secrets not printed
- Official actions only
- Workflow files reviewed

**Secrets:**
- CLAUDE_API_KEY
- SENDGRID_API_KEY
- DATABASE_URL
- RAPIDAPI_KEY

---

## API Specification

### Base URL
```
http://localhost:3000/api/v1
```

All endpoints are prefixed with `/api/v1`. Future breaking changes will increment to `/api/v2`.

### Rate Limiting

All endpoints are rate-limited to prevent abuse:
```
100 requests/minute per IP (default)
```
Exceeding the limit returns `429 Too Many Requests`.

### Health Check

**Endpoint:** `GET /health`

**Response (200 OK):**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "agentMemoryLoaded": true,
  "resumeLoaded": true,
  "dbConnected": true,
  "timestamp": "2024-05-11T08:00:00Z"
}
```

### Endpoints

#### 1. Get Recommendations
**Endpoint:** `GET /jobs/recommendations`

**Response:**
```json
{
  "byLocation": {
    "remote": {
      "autoFlagged": [
        {
          "id": "uuid",
          "title": "Staff Software Engineer",
          "company": "Google",
          "relevanceScore": 85,
          "interviewChance": 78,
          "reasoning": "Strong match: Your 7 years Java/Spring experience aligns...",
          "insights": "Distributed systems focus matches your background...",
          "coverLetterDraft": "Dear Google...",
          "applyUrl": "https://...",
          "matchedPatterns": ["distributed_systems", "company_scale"]
        }
      ],
      "needsReview": []
    },
    "washington": {
      "autoFlagged": [],
      "needsReview": []
    },
    "other": {
      "autoFlagged": [],
      "needsReview": []
    }
  },
  "metadata": {
    "agentStrategy": "Prioritize distributed systems + Company A pattern",
    "patternsDetected": ["company_a_success", "distributed_systems_preference"],
    "lastRun": "2024-05-11T08:00:00Z",
    "jobsAnalyzed": 47,
    "topPatternConfidence": 0.85
  }
}
```

#### 2. Get Agent Insights
**Endpoint:** `GET /agent/insights`

**Response (200 OK):**
```json
{
  "strategy": "Prioritize distributed systems + Company A pattern",
  "patterns": [
    {
      "name": "distributed_systems_preference",
      "confidence": 0.85,
      "observationCount": 12,
      "lastObserved": "2024-05-10T08:00:00Z"
    }
  ],
  "successRate": 0.33,
  "totalObservations": 12,
  "memoryRetentionDays": 90
}
```

#### 3. Get Applications
**Endpoint:** `GET /applications`

**Query Parameters:**
```
status=applied|interview_scheduled|rejected|offer|archived (default: all)
location=remote|washington|other|all (default: all)
sort_by=applied_at|status (default: applied_at desc)
limit=20 (default)
offset=0
```

**Response (200 OK):**
```json
{
  "applications": [
    {
      "id": "uuid",
      "jobId": "uuid",
      "jobTitle": "Staff Software Engineer",
      "company": "Google",
      "locationCategory": "remote",
      "appliedAt": "2024-05-08T10:00:00Z",
      "status": "interview_scheduled",
      "interviewDate": "2024-05-20T14:00:00Z",
      "relevanceScore": 85,
      "interviewChance": 78
    }
  ],
  "metadata": {
    "totalCount": 15,
    "byStatus": { "applied": 12, "interview_scheduled": 2, "rejected": 1 }
  }
}
```

#### 4. Mark Job as Applied
**Endpoint:** `POST /applications`

**Request Body:**
```json
{
  "jobId": "uuid",
  "coverLetterUsed": "Dear Google Hiring Team...",
  "userNotes": "Applied via careers page"
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "jobId": "uuid",
  "status": "applied",
  "appliedAt": "2024-05-11T10:00:00Z"
}
```

**Error Responses:**
- `400 Bad Request` — Missing `jobId`
- `404 Not Found` — Job not found
- `409 Conflict` — Already applied to this job

#### 5. Update Application Status
**Endpoint:** `PUT /applications/:id`

**Request Body:**
```json
{
  "status": "interview_scheduled",
  "interviewDate": "2024-05-20T14:00:00Z",
  "userNotes": "Phone screen with recruiter"
}
```

**Valid statuses:** `applied`, `interview_scheduled`, `rejected`, `offer`, `archived`

**Response (200 OK):**
```json
{
  "id": "uuid",
  "status": "interview_scheduled",
  "interviewDate": "2024-05-20T14:00:00Z",
  "updatedAt": "2024-05-11T11:00:00Z"
}
```

**Error Responses:**
- `400 Bad Request` — Invalid status value
- `404 Not Found` — Application not found

#### 6. Get User Data (Export)
**Endpoint:** `GET /user/data/export`

Returns all stored user data for GDPR/privacy compliance.

**Response (200 OK):**
```json
{
  "exportedAt": "2024-05-11T10:00:00Z",
  "resumeMetadata": { "yearsExperience": 7, "technologies": ["Java"] },
  "applications": [],
  "agentMemory": [],
  "note": "Raw resume text and PII are never stored."
}
```

#### 7. Delete User Data
**Endpoint:** `DELETE /user/data`

Permanently deletes all user data (right to erasure — GDPR Article 17).

**Response (200 OK):**
```json
{
  "deleted": true,
  "message": "All user data permanently deleted.",
  "deletedAt": "2024-05-11T10:00:00Z"
}
```

### Error Response Format

All errors use this consistent shape:
```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "timestamp": "2024-05-11T10:00:00Z"
}
```

| HTTP Status | Code | Meaning |
|-------------|------------------------|-------------------------------|
| 400 | `BAD_REQUEST` | Missing or invalid input |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate resource |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error (check logs) |
| 503 | `SERVICE_UNAVAILABLE` | Claude API or DB down |

---

## Workflow Specification

### Workflow 1: Agent Startup (One-Time)

```
1. Load resume PDF from RESUME_PATH
2. Parse PDF → extract text
3. Redact PII:
   - Phone → [REDACTED_PHONE]
   - Email → [REDACTED_EMAIL]
   - Address → [REDACTED_ADDRESS]
   - SSN → [REDACTED_SSN]
   - DOB → [REDACTED_DOB]
   - References → [REDACTED_REFERENCES]
4. Save redacted resume to DB
5. Keep redacted in agent memory
6. Load agent memory from DB (patterns, learnings)
7. Ready to operate
8. Cost: One-time (minimal)
```

### Workflow 2: Daily Agent Run (8 AM PT)

```
1. Resume already in memory (redacted, persistent)
2. Agent memory already in memory (loaded from DB)
3. Fetch jobs (tool call)
4. Analyze each job (using resume + memory context)
5. Categorize & prioritize
6. Learn new patterns
7. Store analysis in DB
8. Update agent memory in DB
9. Dashboard updated
10. Cost: ~$0.26
```

### Workflow 3: Resume Update Detection

```
1.  File change detected (hash mismatch on RESUME_PATH)
2.  Load new resume PDF
3.  Redact PII
4.  Re-extract metadata (years_exp, technologies, companies, seniority)
5.  Reload redacted text AND metadata into agent memory
6.  Compute changeScore vs. old metadata
7a. changeScore > 0.5 (major change):
      → Reset all agent memory patterns
      → Log: "Major resume change — agent memory reset"
7b. changeScore ≤ 0.5 (minor change):
      → Decay all pattern confidence scores by 20%
      → Log: "Minor resume change — pattern confidence decayed"
8.  Mark all existing claude_analysis rows as is_stale = TRUE
9.  Update resume_metadata table in DB
10. Next agent run (8 AM) re-analyzes jobs using updated profile
```

### Workflow 4: User Views Dashboard

```
1. Dashboard loads
2. Calls GET /jobs/recommendations
3. Shows recommendations grouped by location + priority
4. Shows agent strategy explanation
5. Shows matched patterns
6. User can apply, track, generate cover letters
```

### Workflow 5: Weekly Digest Email (Sunday 6 PM)

```
1. Query week's jobs analyzed
2. Query agent learnings
3. Build email:
   - "This week: 283 jobs analyzed"
   - "Agent learned: Distributed systems pattern"
   - "Top recommendations: [3-5 jobs]"
   - "Your progress: [applications, interview rate]"
   - No PII included
4. Send via SendGrid
```

---

## External Integrations

### Job APIs (Legitimate)

| API | Status | Auth | Free Tier |
|---------------------------|------------------------|------------|----------------|
| **JSearch (RapidAPI)** | ✅ Active | API Key | 100 req/month |
| **Hacker News (Algolia)** | ✅ Active | None | Unlimited |
| **RemoteOK** | ✅ Active | None | Unlimited |
| **AngelList (Wellfound)** | ✅ Active | API Key | Varies |
| ~~GitHub Jobs~~ | ❌ Shut down May 2022 | — | — |
| ~~Stack Overflow Jobs~~ | ❌ Shut down March 2022 | — | — |

> **Note:** GitHub Jobs and Stack Overflow Jobs are no longer available. JSearch (RapidAPI) aggregates Indeed, LinkedIn, and Glassdoor and is the recommended primary source. Remove shut-down APIs from your implementation.

### Claude API
- Model: `claude-opus-4-7`
- Tool use enabled
- Cost: ~$0.26/day = ~$7.80/month

### SendGrid
- Free tier: 100 emails/month
- Cost: $0

---

## Cost Breakdown

```
MONTHLY:
  Claude API (agent):  $7.80   (~$0.26/day × 30)
  SendGrid:            $0.00   (free tier: 100 emails/day)
  Job APIs:            $0.00   (free tiers)
  PostgreSQL (local):  $0.00   (self-hosted)
  GitHub Actions:      $0.00   (free for public repos)
  ─────────────────────────────────────────────────
  TOTAL:               $7.80/month
```

> **Note:** Claude Pro ($20/month) is a consumer subscription for claude.ai and is **not required** for API access. You only need a Claude API key (`CLAUDE_API_KEY`), billed by usage.

---

## Key Differentiators

✅ **Truly Autonomous:** Agent persists, learns, improves  
✅ **Privacy-First:** All PII redacted before processing  
✅ **Secure:** Never stores/transmits sensitive data  
✅ **Intelligent:** Rich context = better decisions  
✅ **Efficient:** Resume loaded once, reused forever  
✅ **Learning:** Patterns grow stronger over time  
✅ **Reusable:** Others can fork with confidence

---

**Document Status:** Ready for Implementation  
**Architecture:** Long-Running Autonomous Agent + PII Redaction  
**Next Step:** Phase 1 Backend Development
