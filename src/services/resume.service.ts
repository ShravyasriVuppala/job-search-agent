import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ResumeMetadata } from '../types';
import { logger } from '../utils/logger';

// pdf-parse v1 is a CJS module with no bundled types; require avoids the declaration gap
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;

// PII redaction happens BEFORE any processing, storage, or transmission.
// Original resume never stored in DB, never sent to Claude API, never logged.
// Only redacted version persists in memory and database.

interface RedactionPattern {
  pattern: RegExp;
  replacement: string;
  label: string;
}

// SSN must run before phone to prevent partial overlaps on digit sequences.
const REDACTION_PATTERNS: RedactionPattern[] = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]', label: 'SSN' },
  // Covers: +1(425)606-1234, (425) 606-1234, 425-606-1234, 425.606.1234, 4256061234
  { pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[REDACTED_PHONE]', label: 'phone' },
  { pattern: /[\w.\-]+@[\w.\-]+\.\w+/g, replacement: '[REDACTED_EMAIL]', label: 'email' },
  { pattern: /\b\d{5}(?:-\d{4})?\b/g, replacement: '[REDACTED_ZIP]', label: 'zipcode' },
  { pattern: /(?:\d{1,2}\/){2}\d{4}/g, replacement: '[REDACTED_DOB]', label: 'DOB' },
  { pattern: /References:[\s\S]*$/gi, replacement: '[REDACTED_REFERENCES]', label: 'references' },
];

const TECH_KEYWORDS = [
  'Java', 'Python', 'JavaScript', 'TypeScript', 'Go', 'Golang', 'Rust', 'C++', 'C#', 'Ruby', 'Scala', 'Kotlin', 'Swift',
  'Spring Boot', 'Spring', 'React', 'Angular', 'Vue', 'Node.js', 'Django', 'Flask', 'FastAPI', 'Rails',
  'Kafka', 'RabbitMQ', 'Redis', 'Elasticsearch', 'Solr', 'Cassandra', 'MongoDB', 'DynamoDB',
  'PostgreSQL', 'MySQL', 'Oracle', 'SQL Server', 'SQLite',
  'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'GitHub Actions', 'CircleCI',
  'Spark', 'Hadoop', 'Airflow', 'Flink',
  'gRPC', 'GraphQL', 'Microservices', 'Prometheus', 'Grafana', 'Datadog',
  'AWS', 'GCP', 'Azure',
];

const CERTIFICATION_PATTERNS = [
  'AWS Certified', 'AWS Solutions Architect', 'AWS Developer', 'AWS DevOps',
  'GCP Professional', 'Google Cloud', 'Azure Certified',
  'CKA', 'CKAD', 'CKS', 'PMP', 'CISSP', 'CISA', 'CISM',
  'Cloud Practitioner', 'Solutions Architect', 'Developer Associate',
];

const SOFT_SKILL_KEYWORDS = [
  'leadership', 'mentoring', 'mentorship', 'communication', 'collaboration',
  'teamwork', 'problem-solving', 'analytical', 'strategic', 'initiative', 'ownership',
];

const SENIORITY_LEVELS = ['Principal', 'Staff', 'Senior', 'Lead', 'Junior', 'Associate', 'Intern'];

export function extractSeniorityLevel(text: string): string | undefined {
  for (const level of SENIORITY_LEVELS) {
    if (new RegExp(`\\b${level}\\b`, 'i').test(text)) return level;
  }
  return undefined;
}

function extractYearsExperience(text: string): number | undefined {
  const match = text.match(/(\d+)\+?\s+years?(?:\s+of)?\s+experience/i);
  return match?.[1] ? parseInt(match[1], 10) : undefined;
}

function extractTechnologies(text: string): string[] {
  // Longer multi-word keywords first to avoid partial matches (e.g. "Spring Boot" before "Spring")
  return TECH_KEYWORDS.filter((tech) =>
    new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text),
  );
}

function extractCompanies(text: string): string[] {
  const companies: string[] = [];
  const atPattern = /(?:^|\s)(?:at|for|@)\s+([A-Z][A-Za-z0-9&\s.,'-]+?)(?=\s*[,(\n|]|$)/gm;
  let match;
  while ((match = atPattern.exec(text)) !== null) {
    const company = match[1]?.trim().replace(/\s+/g, ' ');
    if (company && company.length >= 2 && company.length <= 60) {
      companies.push(company);
    }
  }
  return [...new Set(companies)];
}

function extractEducationLevel(text: string): string | undefined {
  if (/\bPh\.?D\.?\b/i.test(text)) return 'PhD';
  if (/\bM\.?S\.?\b|\bMasters?\b|\bM\.?Eng\.?\b/i.test(text)) return 'MS';
  if (/\bB\.?S\.?\b|\bBachelors?\b|\bB\.?Eng\.?\b|\bB\.?A\.?\b/i.test(text)) return 'BS';
  return undefined;
}

function extractCertifications(text: string): string[] {
  return CERTIFICATION_PATTERNS.filter((cert) =>
    new RegExp(cert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text),
  );
}

function extractSoftSkills(text: string): string[] {
  return SOFT_SKILL_KEYWORDS.filter((skill) =>
    new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text),
  );
}

function redactText(text: string): { redacted: string; counts: Record<string, number> } {
  let redacted = text;
  const counts: Record<string, number> = {};
  for (const { pattern, replacement, label } of REDACTION_PATTERNS) {
    const matches = redacted.match(pattern);
    counts[label] = matches ? matches.length : 0;
    redacted = redacted.replace(pattern, replacement);
  }
  return { redacted, counts };
}

export class ResumeService {
  async loadAndRedact(resumePath: string): Promise<{
    redactedText: string;
    hash: string;
    metadata: ResumeMetadata;
  }> {
    const fileBuffer = fs.readFileSync(resumePath);
    const ext = path.extname(resumePath).toLowerCase();

    let originalText: string;
    if (ext === '.pdf') {
      const result = await pdfParse(fileBuffer);
      originalText = result.text;
    } else {
      originalText = fileBuffer.toString('utf8');
    }

    const hash = crypto.createHash('sha256').update(originalText).digest('hex');
    const { redacted: redactedText, counts } = redactText(originalText);

    const metadata: ResumeMetadata = {
      resumeHash: hash,
      resumeRedacted: redactedText,
      isCurrent: true,
      yearsExperience: extractYearsExperience(redactedText),
      technologies: extractTechnologies(redactedText),
      companies: extractCompanies(redactedText),
      educationLevel: extractEducationLevel(redactedText),
      certifications: extractCertifications(redactedText),
      softSkills: extractSoftSkills(redactedText),
    };

    const redactedSummary = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([label, n]) => `${n} ${label}`)
      .join(', ');

    logger.info(
      `Loaded resume: ${originalText.length.toLocaleString()} chars → ` +
        `${redactedText.length.toLocaleString()} after redaction` +
        (redactedSummary ? ` (${redactedSummary} redacted)` : ''),
    );

    return { redactedText, hash, metadata };
  }
}