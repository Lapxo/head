import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface Capture { readonly protocol: string; readonly inputs: readonly { path: string; sha256: string }[];
  readonly runs: readonly { node: string; output: string }[] }
const digest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** Read the preserved regional client runs against their exact current inputs. This is no release or source-budget verdict. */
export function observe(bytes: Uint8Array) {
  if (digest(bytes) !== 'sha256:5afcd841e5ad36c57df79e477f395656c9db7379af8c8939b169e2fe9a79a1fc') throw Error('REFUSE·share-inspect capture digest');
  const capture = JSON.parse(new TextDecoder().decode(bytes)) as Capture;
  if (capture.protocol !== 'head-share-inspect-capture@1' || capture.runs.length !== 2) throw Error('REFUSE·share-inspect protocol');
  const nodes = new Set<string>();
  for (const run of capture.runs) {
    if (!['22', '24'].includes(run.node) || nodes.has(run.node) || !/^(?:# |ℹ )tests 9$/m.test(run.output)
      || !/^(?:# |ℹ )pass 9$/m.test(run.output) || !/^(?:# |ℹ )fail 0$/m.test(run.output) || /^not ok /m.test(run.output)) throw Error('REFUSE·share-inspect incomplete runs');
    nodes.add(run.node);
  }
  return [{ scope: 'share-inspect/verified', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }];
}

export function run(place: string) {
  const bytes = readFileSync('samples/share-inspect/yes/client.json'), capture = JSON.parse(bytes.toString()) as Capture;
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : []);
  const selected = [...files('src'), ...files('test').filter(path => !['test/share-inspect.ts', 'test/first-minute.ts', 'test/walk-reading.ts'].includes(path))].sort();
  if (!Array.isArray(capture.inputs) || capture.inputs.length !== selected.length || capture.inputs.some((input, index) => input.path !== selected[index] || digest(readFileSync(input.path)) !== input.sha256)) throw Error('REFUSE·share-inspect changed input');
  if (place.replace(/\/$/, '') !== 'samples/share-inspect/yes') return [{ scope: 'share-inspect/current-inputs', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }];
  return observe(bytes);
}
