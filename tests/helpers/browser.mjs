import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

// Only the HTML is copied: missing sibling assets must remain observable.
export function standaloneFixture(prefix, artifact = process.argv[2] || path.join(root, 'dino.html')) {
  if (!/^dino-[a-z-]+-$/.test(prefix)) throw new Error('Invalid standalone fixture prefix');
  const tempRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(tempRoot, prefix));
  const file = path.join(directory, 'dino.html');
  const cleanup = () => {
    const target = path.resolve(directory);
    if (path.dirname(target) !== tempRoot || !path.basename(target).startsWith(prefix))
      throw new Error('Refusing to remove a directory outside the fixture');
    fs.rmSync(target, { recursive: true, force: true });
  };
  try {
    fs.copyFileSync(artifact, file);
  } catch (error) {
    cleanup();
    throw error;
  }
  return { file, cleanup };
}

export function capturePageErrors(page, { consoleErrors = true } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  if (consoleErrors) page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
