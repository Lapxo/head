import { run as verifyRuntimeInventory } from './runtime-inventory.ts';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, parse, publicationOf } from '@lapxo/topos/wire';

const hash = (bytes: Uint8Array | string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const independent = ["test/first-minute.ts","test/share-inspect.ts","test/authority-preflight-reader.ts","test/walk-reading.ts","test/foundation-reading.ts","test/source-lines.ts"];
interface Capture { readonly protocol: string; readonly policy: string; readonly inputs: readonly { path: string; sha256: string }[];
  readonly runs: readonly { node: string; suitePasses: number; output: string }[] }
/** Read the existing consumer vectors, never implement the walk or infer a new grant. */
export function observe(bytes: Uint8Array) {
  if (hash(bytes) !== 'sha256:4f99f80d8bb21015304dc3fa19d90ce2e6fc033103aa1d24163250a0e748432a') throw Error('REFUSE·walk capture digest');
  const capture = JSON.parse(new TextDecoder().decode(bytes)) as Capture, nodes = new Set<string>();
  if (capture.protocol !== 'head-walk-reading@1' || capture.runs.length !== 2) throw Error('REFUSE·walk capture protocol');
  for (const run of capture.runs) {
    if (!['22', '24'].includes(run.node) || nodes.has(run.node) || run.suitePasses !== 2
      || !new RegExp('^(?:# |ℹ )pass ' + run.suitePasses + '$', 'm').test(run.output) || !/^(?:# |ℹ )fail 0$/m.test(run.output)
      || !/^(?:ok \d+ - |✔ )every place head founds can be walked by bound:/m.test(run.output)
      || !/^(?:ok \d+ - |✔ )a place that connected a source and granted a read can still be walked/m.test(run.output)) throw Error('REFUSE·walk incomplete vectors');
    nodes.add(run.node);
  }
  return [{ scope: 'birth/view/walk', role: 'writes', measure: 'id', bound: { kind: 'enumerated', values: ['walk@*'] } }];
}
/** Bind those runs to fresh source bytes and the declared birth, walk, host and instrument contract. */
export function run(place: string) {
  verifyRuntimeInventory('dependency/runtime-inventory');
  const bytes = readFileSync('samples/walk-reading/yes/client.json'), capture = JSON.parse(bytes.toString()) as Capture;
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);
  const selected = [...files('src'), ...files('test').filter(path => !independent.includes(path))].sort();
  if (capture.inputs.length !== selected.length || capture.inputs.some((f, i) => f.path !== selected[i] || hash(readFileSync(f.path)) !== f.sha256)) throw Error('REFUSE·walk current inputs');
  const policy = publicationOf(readFileSync('TARGET.bound', 'utf8').split('\n').filter(Boolean)).map(l => parse(l)).filter(p => p.kind === 'fact').map(p => p.value.fields)
    .filter(f => ['birth/', 'walk/', 'bound/'].some(prefix => f.scope?.startsWith(prefix)) || ['dep/bound', 'dep/bound/installed', 'sources/bound'].includes(f.scope ?? '')).map(f => canonical(f)).sort();
  if (hash(policy.join('\n') + '\n') !== capture.policy) throw Error('REFUSE·walk policy moved');
  return place.replace(/\/$/, '') === 'samples/walk-reading/yes' ? observe(bytes) : [{ scope: 'walk-reading/current-inputs', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }];
}
