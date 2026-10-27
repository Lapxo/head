import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface Capture { readonly protocol: string; readonly inputs: readonly { path: string; sha256: string }[]; readonly runs: readonly { node: string; output: string }[] }
const hash = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
/** Project complete, reviewed source-client runs. This does not certify source budgets, Q4 completeness or an installed release. */
export function observe(bytes: Uint8Array) {
  if (hash(bytes) !== 'sha256:d35558a76bbb9051137da7befc5bee72c3cd6e4f9138e4531752f113dbda481e') throw Error('REFUSE·authority-preflight capture digest');
  const capture = JSON.parse(new TextDecoder().decode(bytes)) as Capture;
  if (capture.protocol !== 'head-authority-preflight-capture@1' || !Array.isArray(capture.runs) || capture.runs.length !== 2) throw Error('REFUSE·authority-preflight capture protocol');
  const nodes = new Set<string>();
  for (const run of capture.runs) {
    if (!['22', '24'].includes(run.node) || nodes.has(run.node) || !/^# tests 8$/m.test(run.output) || !/^# pass 8$/m.test(run.output) || !/^# fail 0$/m.test(run.output) || /^not ok /m.test(run.output)) throw Error('REFUSE·authority-preflight incomplete runs');
    nodes.add(run.node);
  }
  return [{ scope: 'authority-preflight/configuration', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }];
}
export function run(place: string) {
  const bytes = readFileSync('samples/authority-preflight/yes/client.json'), capture = JSON.parse(bytes.toString()) as Capture;
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : []);
  const expected = [...files('src'), ...files('test').filter(path => !['test/first-minute.ts', 'test/share-inspect.ts', 'test/authority-preflight-reader.ts', 'test/walk-reading.ts'].includes(path)), 'docs/contracts/authority-preflight.json'].sort();
  if (!Array.isArray(capture.inputs) || capture.inputs.length !== expected.length || capture.inputs.some((input, i) => input.path !== expected[i] || hash(readFileSync(input.path)) !== input.sha256)) throw Error('REFUSE·authority-preflight current inputs');
  return place.replace(/\/$/, '') === 'samples/authority-preflight/yes' ? observe(bytes) : [{ scope: 'authority-preflight/current-inputs', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }];
}
