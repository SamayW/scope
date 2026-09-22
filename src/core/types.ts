// The Scope contract. Shared by core, the CLI, and the VS Code extension.
// This file must never import the vscode module, so the CLI and the git hook can use it.

export type RiskLevel = 'high' | 'medium' | 'low';

export type Domain =
  | 'auth'
  | 'db'
  | 'deps'
  | 'tests'
  | 'config'
  | 'api'
  | 'ui'
  | 'other';

export type FileStatus = 'added' | 'deleted' | 'renamed' | 'modified';

export type FlagId =
  | 'deleted-test'
  | 'skip-only'
  | 'removed-assertion'
  | 'secret'
  | 'env-file'
  | 'sensitive-domain'
  | 'new-dependency'
  | 'lint-suppression'
  | 'empty-catch'
  | 'ci-change';

export interface RiskFlag {
  id: FlagId;
  message: string;
  points: number;
}

/**
 * One chunk of one file. `added` and `removed` hold the changed lines with
 * their +/- prefix stripped, so the risk rules can match against content.
 */
export interface Hunk {
  id: string;
  file: string;
  fileStatus: FileStatus;
  added: string[];
  removed: string[];
  /**
   * Headers plus body, ending in a newline. Must stay applyable: the extension
   * pipes this into `git apply -R` to revert a single hunk.
   */
  patch: string;
}

export interface ClassifiedHunk extends Hunk {
  domain: Domain;
  flags: RiskFlag[];
  score: number;
  inScope: boolean;
  approved: boolean;
}

export interface Group {
  domain: Domain;
  risk: RiskLevel;
  score: number;
  outOfScope: boolean;
  hunks: ClassifiedHunk[];
  checks: CheckResult[];
}

export interface Session {
  task: string;
  baseline: string;
  allow: {
    globs: string[];
    domains: Domain[];
  };
  approved: string[];
  createdAt: string;
}

/** `session` is null when no session is active, in which case everything is in scope. */
export interface Analysis {
  session: Session | null;
  groups: Group[];
  changedFiles: string[];
}

/**
 * Open rather than a closed union: custom checks declared in .scope.yml carry
 * ids we cannot know ahead of time.
 */
export type CheckId = string;

/** `domains: 'any'` means the check covers the whole diff, not one domain. */
export interface Check {
  id: CheckId;
  label: string;
  command: string;
  args: string[];
  domains: Domain[] | 'any';
  timeoutMs: number;
}

export type CheckStatus = 'pass' | 'fail' | 'skip' | 'timeout';

export interface CheckResult {
  checkId: CheckId;
  /** Carried on the result so the gate can name the check without the Check list. */
  label: string;
  status: CheckStatus;
  exitCode: number | null;
  durationMs: number;
  output: string;
}

export interface Stack {
  typescript: boolean;
  next: boolean;
  prisma: boolean;
  eslint: boolean;
  docker: boolean;
  /** Which runner to shell out to, or null when the project has neither. */
  testRunner: 'vitest' | 'jest' | null;
  packageManager: 'npm' | 'yarn' | 'pnpm';
}

export type BlockRule = 'failing_checks' | 'deleted_tests' | 'secrets' | 'out_of_scope';

export interface Policy {
  blockOn: BlockRule[];
  /** Extra per-domain commands from the `groups:` key in .scope.yml. */
  customChecks?: Record<string, string[]>;
}

export interface GateReason {
  kind: BlockRule;
  message: string;
}

export interface GateResult {
  blocked: boolean;
  reasons: GateReason[];
}
