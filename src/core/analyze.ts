import { classify } from './classify.js';
import { parseHunks } from './diff.js';
import { getFallbackBaseline, getRawDiff, SCOPE_STATE_PREFIX } from './git.js';
import { buildGroups } from './group.js';
import { scoreHunk } from './risk.js';
import { isInScope } from './scope.js';
import { loadSession } from './session.js';
import type { Analysis, ClassifiedHunk } from './types.js';

/** The whole pipeline: git diff in, grouped and scored Analysis out. */
export async function analyze(cwd: string = process.cwd()): Promise<Analysis> {
  const session = loadSession(cwd);
  const baseline = session?.baseline ?? (await getFallbackBaseline(cwd));
  const hunks = parseHunks(await getRawDiff(cwd, baseline)).filter(
    (hunk) => !hunk.file.startsWith(SCOPE_STATE_PREFIX)
  );

  const classified: ClassifiedHunk[] = hunks.map((hunk) => {
    const domain = classify(hunk);
    const flags = scoreHunk(hunk, domain);

    return {
      ...hunk,
      domain,
      flags,
      score: flags.reduce((sum, flag) => sum + flag.points, 0),
      inScope: isInScope(hunk, domain, session),
      approved: session?.approved.includes(hunk.id) ?? false,
    };
  });

  return {
    session,
    groups: buildGroups(classified),
    changedFiles: [...new Set(hunks.map((hunk) => hunk.file))],
  };
}
