import { toLevel } from './risk.js';
import type { ClassifiedHunk, Domain, Group } from './types.js';

/**
 * Out-of-scope work counts double. An agent touching auth when it was asked to
 * touch the signup form is worse than the same edit inside the declared scope,
 * and doubling is what floats it to the top of the list.
 */
function effectiveScore(hunk: ClassifiedHunk): number {
  const unapprovedOutOfScope = !hunk.inScope && !hunk.approved;
  return unapprovedOutOfScope ? hunk.score * 2 : hunk.score;
}

/** Buckets by domain, sorts by score descending. Pure. */
export function buildGroups(hunks: ClassifiedHunk[]): Group[] {
  const byDomain = new Map<Domain, ClassifiedHunk[]>();

  for (const hunk of hunks) {
    const existing = byDomain.get(hunk.domain);
    if (existing) {
      existing.push(hunk);
    } else {
      byDomain.set(hunk.domain, [hunk]);
    }
  }

  const groups: Group[] = [];

  for (const [domain, domainHunks] of byDomain) {
    const score = domainHunks.reduce((sum, hunk) => sum + effectiveScore(hunk), 0);

    groups.push({
      domain,
      risk: toLevel(score),
      score,
      outOfScope: domainHunks.some((hunk) => !hunk.inScope && !hunk.approved),
      hunks: domainHunks,
      checks: [],
    });
  }

  // Domain is the tiebreak so equal scores still produce a stable order.
  return groups.sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
}
