import parseDiff from 'parse-diff';
import type { FileStatus, Hunk } from './types.js';

/**
 * Parses a unified diff into one Hunk per chunk. Pure.
 *
 * The rebuilt `patch` is what the extension feeds to `git apply -R` to revert a
 * single hunk, so it carries its own headers and ends with a newline. Added and
 * deleted files need their file-mode line as well: without it git cannot
 * resolve the /dev/null side and refuses the patch.
 */
export function parseHunks(raw: string): Hunk[] {
  if (!raw.trim()) {
    return [];
  }

  const hunks: Hunk[] = [];

  for (const parsed of parseDiff(raw)) {
    const from = parsed.from ?? '/dev/null';
    const to = parsed.to ?? '/dev/null';
    const file = to !== '/dev/null' ? to : from;

    // `git diff --no-index /dev/null <file>` does not set the `new` flag, so
    // fall back to the /dev/null sides to classify added and deleted files.
    const fileStatus: FileStatus =
      parsed.new || from === '/dev/null'
        ? 'added'
        : parsed.deleted || to === '/dev/null'
          ? 'deleted'
          : from !== to
            ? 'renamed'
            : 'modified';

    const headerLines = [`diff --git a/${from === '/dev/null' ? file : from} b/${file}`];

    if (fileStatus === 'deleted') {
      headerLines.push(`deleted file mode ${parsed.oldMode ?? '100644'}`);
    } else if (fileStatus === 'added') {
      headerLines.push(`new file mode ${parsed.newMode ?? '100644'}`);
    }

    // parse-diff splits "index 90e548d..a813af6 100644" into separate array
    // entries. Emitting one line each produces a malformed second index line,
    // so they are rejoined into the single line git actually wrote.
    if (parsed.index && parsed.index.length > 0) {
      headerLines.push(`index ${parsed.index.join(' ')}`);
    }

    headerLines.push(
      `--- ${from === '/dev/null' ? '/dev/null' : `a/${from}`}`,
      `+++ ${to === '/dev/null' ? '/dev/null' : `b/${to}`}`
    );

    const header = headerLines.join('\n');

    parsed.chunks.forEach((chunk, index) => {
      const body = [chunk.content, ...chunk.changes.map((c) => c.content)].join('\n');

      hunks.push({
        id: `${file}#${index}`,
        file,
        fileStatus,
        added: chunk.changes.filter((c) => c.type === 'add').map((c) => c.content.slice(1)),
        removed: chunk.changes.filter((c) => c.type === 'del').map((c) => c.content.slice(1)),
        patch: `${header}\n${body}\n`,
      });
    });
  }

  return hunks;
}
