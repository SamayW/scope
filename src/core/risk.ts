import type { Domain, Hunk, RiskFlag, RiskLevel } from './types.js';

/** Exported so the secret-scan check can reuse the same patterns. */
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

/** Returns every risk flag the hunk trips. Pure. */
export function scoreHunk(hunk: Hunk, domain: Domain): RiskFlag[] {
  throw new Error('not implemented');
}
