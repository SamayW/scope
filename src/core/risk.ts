import type { Domain, Hunk, RiskFlag, RiskLevel } from './types.js';

/** Exported so the secret-scan check can reuse exactly these patterns. */
export const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9-]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(password|secret|api_?key)\s*[:=]\s*["'][^"']{6,}["']/i,
];

export function toLevel(score: number): RiskLevel {
  if (score >= 10) {
    return 'high';
  }
  if (score >= 4) {
    return 'medium';
  }
  return 'low';
}

interface RiskRule {
  id: RiskFlag['id'];
  points: number;
  applies(hunk: Hunk, domain: Domain): boolean;
  message(hunk: Hunk, domain: Domain): string;
}

const anyLine = (lines: string[], pattern: RegExp) => lines.some((line) => pattern.test(line));

const RULES: RiskRule[] = [
  {
    id: 'deleted-test',
    points: 10,
    applies: (h, d) => d === 'tests' && (h.fileStatus === 'deleted' || h.removed.length > h.added.length),
    message: (h) =>
      h.fileStatus === 'deleted' ? 'Test file deleted' : 'Test file lost more lines than it gained',
  },
  {
    id: 'skip-only',
    points: 8,
    applies: (h) => anyLine(h.added, /\.(skip|only)\(/),
    message: () => 'Test skipped or narrowed with .skip or .only',
  },
  {
    id: 'removed-assertion',
    points: 6,
    applies: (h) => anyLine(h.removed, /expect\(|assert/),
    message: () => 'Assertion removed',
  },
  {
    id: 'secret',
    points: 10,
    applies: (h) => SECRET_PATTERNS.some((pattern) => anyLine(h.added, pattern)),
    message: () => 'Possible secret committed',
  },
  {
    id: 'env-file',
    points: 8,
    applies: (h) => /(^|\/)\.env/.test(h.file),
    message: () => 'Environment file changed',
  },
  {
    id: 'sensitive-domain',
    points: 6,
    applies: (_h, d) => d === 'auth' || d === 'db',
    message: (_h, d) => `Change touches the ${d} domain`,
  },
  {
    id: 'new-dependency',
    points: 4,
    applies: (h, d) => d === 'deps' && anyLine(h.added, /"[\w@/.-]+":\s*"/),
    message: () => 'Dependency added or changed',
  },
  {
    id: 'lint-suppression',
    points: 3,
    applies: (h) => anyLine(h.added, /eslint-disable|@ts-ignore|:\s*any\b/),
    message: () => 'Lint or type check suppressed',
  },
  {
    id: 'empty-catch',
    points: 3,
    applies: (h) => anyLine(h.added, /catch\s*(\(\w*\))?\s*\{\s*\}/),
    message: () => 'Error swallowed by an empty catch',
  },
  {
    id: 'ci-change',
    points: 4,
    applies: (h) => /\.github\//.test(h.file),
    message: () => 'CI configuration changed',
  },
];

/** Returns every risk flag the hunk trips. Pure. */
export function scoreHunk(hunk: Hunk, domain: Domain): RiskFlag[] {
  return RULES.filter((rule) => rule.applies(hunk, domain)).map((rule) => ({
    id: rule.id,
    message: rule.message(hunk, domain),
    points: rule.points,
  }));
}
