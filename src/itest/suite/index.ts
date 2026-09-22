import { resolve } from 'node:path';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 90_000 });
  mocha.addFile(resolve(__dirname, 'extension.test.js'));

  return new Promise((done, fail) => {
    mocha.run((failures) => (failures > 0 ? fail(new Error(`${failures} failing`)) : done()));
  });
}
