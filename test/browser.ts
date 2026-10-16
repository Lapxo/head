import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * A stand-in for this device's browser opener, as the person at it: it opens the address head hands it, answers what the
 * page asks by the names its fields carry, and logs what it was asked. On PATH before any other opener; it never opens a
 * real browser. `seen` reads the log; a person who cannot be reached is an opener that fails.
 */
export const browser = (answers: Readonly<Record<string, string>>, reachable = true) => {
  const dir = mkdtempSync(join(tmpdir(), 'head-browser-')), log = join(dir, 'seen'), script = join(dir, 'person.mjs');
  writeFileSync(log, '');
  writeFileSync(script, [
    `import { appendFileSync } from 'node:fs';`,
    `const url = process.argv[2], answers = ${JSON.stringify(answers)};`,
    `const page = await (await fetch(url)).text();`,
    `const fields = [...new Set([...page.matchAll(/<(?:input|select|button)[^>]* name="([^"]+)"/g)].map((m) => m[1]))];`,
    `appendFileSync(${JSON.stringify(log)}, 'page ' + fields.join(',') + '\\n');`,
    `await fetch(url, { method: 'POST', body: new URLSearchParams(Object.fromEntries(fields.map((f) => [f, answers[f] ?? '']))) });`,
  ].join('\n'));
  for (const opener of ['open', 'xdg-open']) {
    writeFileSync(join(dir, opener), reachable ? `#!/bin/sh\nexec "${process.execPath}" "${script}" "$1"\n` : `#!/bin/sh\necho "$*" >> "${log}.failed"\nexit 1\n`);
    chmodSync(join(dir, opener), 0o755);
  }
  return { path: (env: Readonly<Record<string, string>>) => ({ ...env, PATH: `${dir}${delimiter}${env['PATH'] ?? process.env['PATH'] ?? ''}` }), seen: () => readFileSync(log, 'utf8').split('\n').filter(Boolean) };
};
