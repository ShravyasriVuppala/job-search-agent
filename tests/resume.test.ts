import * as path from 'path';
import * as fs from 'fs';
import { ResumeService } from '../src/services/resume.service';
import { ResumeChangeDetectionService } from '../src/services/resume-change.service';
import { ResumeRepository } from '../src/db/resume.repository';
import { ResumeMetadata } from '../src/types';
import { closePool } from '../src/db/client';

const FIXTURE = path.join(__dirname, 'fixtures', 'sample-resume.txt');
const FIXTURE_TEXT = fs.readFileSync(FIXTURE, 'utf8');

const resumeService = new ResumeService();

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMetadata(overrides: Partial<ResumeMetadata> = {}): ResumeMetadata {
  return {
    resumeHash: 'abc',
    resumeRedacted: 'Senior Software Engineer',
    isCurrent: true,
    yearsExperience: 7,
    technologies: ['Java', 'Spring Boot', 'Kafka'],
    companies: ['Google', 'Microsoft'],
    ...overrides,
  };
}

// ── Resume loading & redaction ────────────────────────────────────────────────

describe('ResumeService', () => {
  let result: Awaited<ReturnType<typeof resumeService.loadAndRedact>>;

  beforeAll(async () => {
    result = await resumeService.loadAndRedact(FIXTURE);
  });

  it('loads a .txt resume file', () => {
    expect(result.redactedText).toBeTruthy();
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('redacts phone numbers', () => {
    expect(result.redactedText).not.toContain('555-123-4567');
    expect(result.redactedText).toContain('[REDACTED_PHONE]');
  });

  it('redacts email addresses', () => {
    expect(result.redactedText).not.toContain('john.smith@example.com');
    expect(result.redactedText).toContain('[REDACTED_EMAIL]');
  });

  it('redacts SSN', () => {
    expect(result.redactedText).not.toContain('123-45-6789');
    expect(result.redactedText).toContain('[REDACTED_SSN]');
  });

  it('redacts references section', () => {
    expect(result.redactedText).not.toContain('Dr. Jane Doe');
    expect(result.redactedText).toContain('[REDACTED_REFERENCES]');
  });

  it('extracts years_experience', () => {
    expect(result.metadata.yearsExperience).toBe(7);
  });

  it('extracts technologies', () => {
    const techs = result.metadata.technologies ?? [];
    expect(techs).toContain('Java');
    expect(techs).toContain('Spring Boot');
    expect(techs).toContain('Kafka');
  });

  it('produces the same hash for the same resume', async () => {
    const second = await resumeService.loadAndRedact(FIXTURE);
    expect(second.hash).toBe(result.hash);
  });

  it('produces a different hash for different content', async () => {
    const altFixture = path.join(__dirname, 'fixtures', 'alt-resume.txt');
    fs.writeFileSync(altFixture, FIXTURE_TEXT + '\nExtra line for different hash');
    const alt = await resumeService.loadAndRedact(altFixture);
    expect(alt.hash).not.toBe(result.hash);
    fs.unlinkSync(altFixture);
  });
});

// ── Change detection ──────────────────────────────────────────────────────────

describe('ResumeChangeDetectionService', () => {
  function makeService(existing: ResumeMetadata | null): ResumeChangeDetectionService {
    const mockRepo = {
      getResumeMetadata: jest.fn().mockResolvedValue(existing),
    } as unknown as ResumeRepository;
    return new ResumeChangeDetectionService(mockRepo);
  }

  it('returns no change when hash matches', async () => {
    const service = makeService(makeMetadata({ resumeHash: 'same-hash' }));
    const result = await service.detectChange('same-hash', makeMetadata({ resumeHash: 'same-hash' }));
    expect(result.changed).toBe(false);
    expect(result.action).toBe('none');
  });

  it('returns no change when no prior resume exists', async () => {
    const service = makeService(null);
    const result = await service.detectChange('any-hash', makeMetadata());
    expect(result.changed).toBe(false);
    expect(result.action).toBe('none');
  });

  it('major career shift yields changeScore > 0.5 → reset_memory', async () => {
    // Full stack change + seniority shift + year delta + different companies
    // triggers multiple scoring signals simultaneously (pure stack change alone = 0.40)
    const service = makeService(
      makeMetadata({
        resumeHash: 'old',
        resumeRedacted: 'Senior Software Engineer',
        technologies: ['Java', 'Spring Boot', 'Kafka'],
        yearsExperience: 7,
        companies: ['Google', 'Microsoft'],
      }),
    );
    const newMeta = makeMetadata({
      resumeHash: 'new',
      resumeRedacted: 'Staff Software Engineer', // seniority shift: Senior→Staff
      technologies: ['Python', 'Django', 'FastAPI'], // completely different stack
      yearsExperience: 5, // years delta
      companies: ['Meta', 'Apple'], // different companies
    });
    const result = await service.detectChange('new', newMeta);
    expect(result.changed).toBe(true);
    expect(result.changeScore).toBeGreaterThan(0.5);
    expect(result.action).toBe('reset_memory');
  });

  it('minor change (added certification) yields changeScore ≤ 0.5 → decay_confidence', async () => {
    const service = makeService(
      makeMetadata({
        resumeHash: 'old',
        technologies: ['Java', 'Spring Boot', 'Kafka', 'PostgreSQL'],
        yearsExperience: 7,
        companies: ['Google', 'Microsoft'],
      }),
    );
    const newMeta = makeMetadata({
      resumeHash: 'new',
      technologies: ['Java', 'Spring Boot', 'Kafka', 'PostgreSQL', 'Redis'], // mostly same
      yearsExperience: 7,
      companies: ['Google', 'Microsoft'],
      certifications: ['AWS Solutions Architect'],
    });
    const result = await service.detectChange('new', newMeta);
    expect(result.changed).toBe(true);
    expect(result.changeScore).toBeLessThanOrEqual(0.5);
    expect(result.action).toBe('decay_confidence');
  });
});

// ── Database integration ──────────────────────────────────────────────────────

describe('ResumeRepository', () => {
  const repo = new ResumeRepository();

  afterAll(async () => {
    await closePool();
  });

  it('saves and retrieves resume metadata', async () => {
    try {
      await repo.saveResumeMetadata({
        resume_hash: 'test-hash-' + Date.now(),
        resume_redacted: 'Senior Engineer with 7 years experience',
        years_experience: 7,
        technologies: ['Java', 'Kafka'],
        companies: ['TestCo'],
        education_level: 'BS',
        certifications: ['AWS Solutions Architect'],
        soft_skills: ['leadership'],
      });

      const retrieved = await repo.getResumeMetadata();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.resumeHash).toMatch(/^test-hash-/);
      expect(retrieved?.yearsExperience).toBe(7);
      expect(retrieved?.technologies).toContain('Java');
      expect(retrieved?.isCurrent).toBe(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes('ECONNREFUSED') ||
        message.includes('ETIMEDOUT') ||
        message.includes('password authentication failed') ||
        message.includes('does not exist')
      ) {
        console.warn('Skipping DB test — no local PostgreSQL available');
        return;
      }
      throw err;
    }
  });

  it('only one row is current after multiple saves', async () => {
    try {
      const pool = (await import('../src/db/client')).getPool();

      await repo.saveResumeMetadata({
        resume_hash: 'hash-a-' + Date.now(),
        resume_redacted: 'Resume A',
      });
      await repo.saveResumeMetadata({
        resume_hash: 'hash-b-' + Date.now(),
        resume_redacted: 'Resume B',
      });

      const { rows } = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM resume_metadata WHERE is_current = TRUE',
      );
      expect(parseInt(rows[0].count, 10)).toBe(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes('ECONNREFUSED') ||
        message.includes('ETIMEDOUT') ||
        message.includes('password authentication failed') ||
        message.includes('does not exist')
      ) {
        console.warn('Skipping DB test — no local PostgreSQL available');
        return;
      }
      throw err;
    }
  });
});