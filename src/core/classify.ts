import type { Domain, Hunk } from './types.js';

/** Assigns a domain. First path match wins, then content match, else 'other'. Pure. */
export function classify(hunk: Hunk): Domain {
  throw new Error('not implemented');
}
