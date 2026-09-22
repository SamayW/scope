import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Analysis } from './types.js';

/**
 * STUB (M0): ignores repoRoot and returns fixtures/analysis.json.
 * Real version runs getDiff, parseHunks, groupHunks, scoreGroup and applyScope.
 *
 * The fixture is read at runtime rather than imported so it can live outside
 * rootDir ("src") without breaking tsc.
 */
export async function analyze(repoRoot: string = process.cwd()): Promise<Analysis> {
  const fixturePath = join(__dirname, '..', '..', 'fixtures', 'analysis.json');
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as Analysis;
}
