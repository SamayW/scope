// The Scope contract. Shared by core, the CLI, and the VS Code extension.
// This file must never import the vscode module, so the CLI and the git hook can use it.

export type Risk = 'high' | 'medium' | 'low';

export type Domain =
  | 'auth'
  | 'db'
  | 'deps'
  | 'tests'
  | 'config'
  | 'api'
  | 'ui'
  | 'other';

export type FlagId =
  | 'deleted-test'
  | 'skipped-test'
  | 'removed-assertion'
  | 'secret'
  | 'env-edit'
  | 'auth-change'
  | 'schema-change'
  | 'removed-validation'
  | 'new-dependency'
  | 'eslint-disable'
  | 'any-type'
  | 'empty-catch'
  | 'ci-edit';

export interface Flag {
  id: FlagId;
  message: string;
  risk: Risk;
  file: string;
  line?: number;
}

export interface Hunk {
  id: string;
  file: string;
  domain: Domain;
  added: number;
  removed: number;
  patch: string;
  inScope: boolean;
  flags: Flag[];
  score: number;
}

export interface Group {
  domain: Domain;
  risk: Risk;
  score: number;
  inScope: boolean;
  approved: boolean;
  hunks: Hunk[];
  flags: Flag[];
}

export interface Session {
  task: string;
  baseline: string;
  allowGlobs: string[];
  allowDomains: Domain[];
  approvedHunks: string[];
  createdAt: string;
}

export interface Analysis {
  session: Session;
  groups: Group[];
  generatedAt: string;
}

export type CheckId =
  | 'tsc'
  | 'eslint'
  | 'prisma-validate'
  | 'vitest-related'
  | 'npm-audit'
  | 'secret-scan';

export interface Check {
  id: CheckId;
  label: string;
  command: string;
  args: string[];
  domains: Domain[];
  timeoutMs: number;
}

export type CheckStatus = 'pass' | 'fail' | 'skip' | 'timeout';

export interface CheckResult {
  checkId: CheckId;
  status: CheckStatus;
  exitCode: number | null;
  durationMs: number;
  output: string;
}

export interface Stack {
  typescript: boolean;
  next: boolean;
  prisma: boolean;
  vitest: boolean;
  jest: boolean;
  eslint: boolean;
  docker: boolean;
}

export type GateReasonKind =
  | 'check-failed'
  | 'deleted-test'
  | 'secret'
  | 'out-of-scope';

export interface GateReason {
  kind: GateReasonKind;
  message: string;
}

export interface Gate {
  blocked: boolean;
  reasons: GateReason[];
}
