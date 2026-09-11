import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

// A company to pull directly from its ATS. `provider` selects which fetcher handles it
// ('greenhouse' for now; 'lever'/'ashby' later). `slug` is the ATS board token, e.g.
// boards.greenhouse.io/<slug>. See config/companies.json.
export interface Company {
  name: string;
  provider: string;
  slug: string;
}

export function loadCompanies(): Company[] {
  const file = path.resolve(process.cwd(), 'config/companies.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(parsed)) throw new Error('companies.json is not an array');
    return parsed.filter(
      (c: unknown): c is Company =>
        !!c &&
        typeof (c as Company).name === 'string' &&
        typeof (c as Company).provider === 'string' &&
        typeof (c as Company).slug === 'string' &&
        (c as Company).slug.trim() !== '',
    );
  } catch {
    logger.warn('config/companies.json missing or invalid — no ATS companies loaded');
    return [];
  }
}
