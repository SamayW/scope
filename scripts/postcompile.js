// tsc drops the executable bit, which breaks `scope` for anyone who ran
// npm link. chmod is not a Windows command, so do it from node instead.
const { chmodSync } = require('node:fs');
const { join } = require('node:path');

try {
  chmodSync(join(__dirname, '..', 'out', 'cli.js'), 0o755);
} catch {
  // Windows has no executable bit and does not need one
}
