import type { Domain, Hunk } from './types.js';

interface Rule {
  domain: Domain;
  paths: RegExp[];
  content: RegExp[];
}

/**
 * Order matters. `tests` sits before `ui` so a .test.tsx file is a test rather
 * than UI, and `auth` sits before `api` so an auth route is treated as the more
 * sensitive of the two.
 */
const RULES: Rule[] = [
  {
    domain: 'tests',
    paths: [/\.test\.|\.spec\.|__tests__\//],
    content: [/\bdescribe\(|\bit\(|\btest\(/],
  },
  {
    domain: 'deps',
    paths: [/(^|\/)package\.json$|lock\.(json|yaml)$|yarn\.lock$/],
    content: [],
  },
  {
    domain: 'db',
    paths: [/schema\.prisma$|migrations\/|\.sql$/],
    content: [/\bprisma\.|\$queryRaw/],
  },
  {
    domain: 'auth',
    paths: [/auth|middleware|session|jwt/i],
    content: [/bcrypt|jwt\.sign|getServerSession/],
  },
  {
    domain: 'config',
    paths: [/(^|\/)\.env|Dockerfile|\.github\/|next\.config\./],
    content: [],
  },
  {
    domain: 'api',
    paths: [/app\/api\/|routes\/|controllers\//],
    content: [],
  },
  {
    domain: 'ui',
    paths: [/components\/|\.tsx$/],
    content: [],
  },
];

/** Assigns a domain. First path match wins, then content match, else 'other'. Pure. */
export function classify(hunk: Hunk): Domain {
  for (const rule of RULES) {
    if (rule.paths.some((pattern) => pattern.test(hunk.file))) {
      return rule.domain;
    }
  }

  const lines = [...hunk.added, ...hunk.removed];

  for (const rule of RULES) {
    if (rule.content.some((pattern) => lines.some((line) => pattern.test(line)))) {
      return rule.domain;
    }
  }

  return 'other';
}
