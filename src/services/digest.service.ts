import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { DigestJob, DigestRepository, WeeklyStats } from '../db/digest.repository';
import { logger } from '../utils/logger';

export class DigestService {
  private readonly digestRepo: DigestRepository;

  constructor(
    private readonly mailgunApiKey: string,
    private readonly mailgunDomain: string,
    private readonly mailgunBaseUrl: string,
    private readonly recipientEmail: string,
  ) {
    this.digestRepo = new DigestRepository();
  }

  async send(): Promise<void> {
    const [stats, autoFlagged, maybeFlagged] = await Promise.all([
      this.digestRepo.getWeeklyStats(),
      this.digestRepo.getAutoFlaggedJobs(),
      this.digestRepo.getMaybeFlaggedJobs(),
    ]);

    logger.info('Sending weekly digest', {
      autoFlagged: autoFlagged.length,
      maybeFlagged: maybeFlagged.length,
      applicationsSubmitted: stats.applicationsSubmitted,
    });

    const html = this.buildHtml(stats, autoFlagged, maybeFlagged);
    await this.sendEmail(html);
    logger.info('Weekly digest sent successfully');
  }

  private buildHtml(stats: WeeklyStats, autoFlagged: DigestJob[], maybeFlagged: DigestJob[]): string {
    const weekOf = new Date();
    weekOf.setDate(weekOf.getDate() - 7);
    const weekLabel = weekOf.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 0; color: #111827; }
  .wrapper { max-width: 640px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .header { background: #1d4ed8; padding: 28px 32px; }
  .header h1 { color: #fff; margin: 0; font-size: 20px; font-weight: 700; }
  .header p { color: #bfdbfe; margin: 4px 0 0; font-size: 13px; }
  .stats { display: flex; gap: 0; border-bottom: 1px solid #e5e7eb; }
  .stat { flex: 1; padding: 20px; text-align: center; border-right: 1px solid #e5e7eb; }
  .stat:last-child { border-right: none; }
  .stat-num { font-size: 28px; font-weight: 800; color: #1d4ed8; }
  .stat-label { font-size: 11px; color: #6b7280; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; }
  .section { padding: 24px 32px; border-bottom: 1px solid #e5e7eb; }
  .section:last-child { border-bottom: none; }
  .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px; }
  .auto-flag-title { color: #15803d; }
  .maybe-flag-title { color: #b45309; }
  .job-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .job-card:last-child { margin-bottom: 0; }
  .job-title { font-size: 15px; font-weight: 600; color: #111827; margin: 0 0 2px; }
  .job-meta { font-size: 13px; color: #6b7280; margin: 0 0 10px; }
  .scores { display: flex; gap: 8px; margin-bottom: 10px; }
  .score-pill { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; }
  .score-relevance { background: #dbeafe; color: #1e40af; }
  .score-interview { background: #f3e8ff; color: #7e22ce; }
  .reasoning { font-size: 13px; color: #374151; margin: 0 0 12px; line-height: 1.5; }
  .apply-btn { display: inline-block; background: #1d4ed8; color: #fff; text-decoration: none; padding: 8px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; }
  .empty { color: #9ca3af; font-size: 13px; font-style: italic; }
  .footer { padding: 20px 32px; background: #f9fafb; text-align: center; font-size: 12px; color: #9ca3af; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Weekly Job Search Digest</h1>
    <p>Week of ${weekLabel}</p>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-num">${stats.jobsFetched}</div>
      <div class="stat-label">Jobs Fetched</div>
    </div>
    <div class="stat">
      <div class="stat-num">${stats.jobsAnalyzed}</div>
      <div class="stat-label">Analyzed</div>
    </div>
    <div class="stat">
      <div class="stat-num">${stats.autoFlagged}</div>
      <div class="stat-label">Auto-flagged</div>
    </div>
    <div class="stat">
      <div class="stat-num">${stats.maybeFlagged}</div>
      <div class="stat-label">Maybe</div>
    </div>
    <div class="stat">
      <div class="stat-num">${stats.applicationsSubmitted}</div>
      <div class="stat-label">Applied</div>
    </div>
  </div>

  <div class="section">
    <p class="section-title auto-flag-title">Auto-flagged Jobs (${autoFlagged.length})</p>
    ${autoFlagged.length === 0
      ? '<p class="empty">No auto-flagged jobs this week.</p>'
      : autoFlagged.map((job) => this.jobCard(job)).join('')
    }
  </div>

  <div class="section">
    <p class="section-title maybe-flag-title">Maybe Jobs (${maybeFlagged.length})</p>
    ${maybeFlagged.length === 0
      ? '<p class="empty">No maybe-flagged jobs this week.</p>'
      : maybeFlagged.map((job) => this.jobCard(job)).join('')
    }
  </div>

  <div class="footer">
    Sent by your Job Search Agent &middot; <a href="http://localhost:5173" style="color:#6b7280">Open Dashboard</a>
  </div>
</div>
</body>
</html>`;
  }

  private jobCard(job: DigestJob): string {
    return `
<div class="job-card">
  <p class="job-title">${this.escape(job.title)}</p>
  <p class="job-meta">${this.escape(job.company)}${job.location ? ` &middot; ${this.escape(job.location)}` : ''}</p>
  <div class="scores">
    <span class="score-pill score-relevance">Relevance: ${Math.round(job.relevanceScore)}%</span>
    <span class="score-pill score-interview">Interview: ${Math.round(job.interviewChance)}%</span>
  </div>
  ${job.relevanceReasoning ? `<p class="reasoning">${this.escape(job.relevanceReasoning)}</p>` : ''}
  <a href="${this.escape(job.applyUrl)}" class="apply-btn">Apply Now</a>
</div>`;
  }

  private escape(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private async sendEmail(html: string): Promise<void> {
    const mailgun = new Mailgun(FormData);
    const client = mailgun.client({ username: 'api', key: this.mailgunApiKey, url: this.mailgunBaseUrl });

    await client.messages.create(this.mailgunDomain, {
      from: `Job Search Agent <mailgun@${this.mailgunDomain}>`,
      to: [this.recipientEmail],
      subject: `Weekly Job Search Digest — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      html,
    });
  }
}
