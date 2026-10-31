import { run as verifyRuntimeInventory } from './runtime-inventory.ts';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, parse, publicationOf } from '@lapxo/topos/wire';

const digest = (bytes: Uint8Array | string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const independent = ['first-minute.ts', 'share-inspect.ts', 'authority-preflight-reader.ts', 'walk-reading.ts', 'foundation-reading.ts'].map(name => `test/${name}`);
interface Capture { protocol: string; policy: string; inputs: { path: string; sha256: string }[]; runs: { node: string; client: string; clientParts?: string[]; identity: string }[] }
export const policyOf = (bytes: string) => digest(publicationOf(bytes.split('\n').filter(Boolean)).map(line => parse(line)).flatMap(p => p.kind === 'fact' ? [p.value.fields] : [])
  .filter(f => /^(founding\/|home\/|first-run\/|do\/|tool\/place(?:\/|$))/.test(f.scope ?? ''))
  .map(({ at: _at, by: _by, sig: _sig, epoch: _epoch, ...f }) => canonical(f)).sort().join('\n') + '\n');
/** Project reviewed Head client vectors only. Current source and policy bytes are checked separately before reuse. */
export function observe(bytes: Uint8Array) {
  if (digest(bytes) !== 'sha256:fae52c17151bd7e558c085e0485c67807ede63ded21dc749af5d0af3e2145215') throw Error('REFUSE·foundation capture digest');
  const capture = JSON.parse(new TextDecoder().decode(bytes)) as Capture, nodes = new Set<string>();
  if (capture.protocol !== 'head-foundation-readings@1' || capture.runs.length !== 2) throw Error('REFUSE·foundation capture protocol');
  const vectors = ['places \\(weather\\)', 'places \\(climate\\)', 'first run \\(URL\\)', 'first run \\(shared documents\\)', 'foundation: a raw do/place', 'a place head founds is a point at birth'];
  for (const run of capture.runs) {
    const parts = run.clientParts ?? [run.client], client = parts.join('\n');
    const passed = parts.map(part => Number(part.match(/^(?:# |ℹ )pass (\d+)$/m)?.[1] ?? -1));
    if (!['22', '24'].includes(run.node) || nodes.has(run.node) || !parts.length || passed.some(n => n < 0) || passed.reduce((a, n) => a + n, 0) !== 6 || parts.some(part => !/^(?:# |ℹ )fail 0$/m.test(part))
      || !/^(?:# |ℹ )pass 1$/m.test(run.identity) || !/^(?:# |ℹ )fail 0$/m.test(run.identity) || !run.identity.includes('foundation identity:')
      || vectors.some(vector => !new RegExp('^(?:ok \\d+ - |✔ )' + vector, 'm').test(client))) throw Error('REFUSE·foundation incomplete vectors');
    nodes.add(run.node);
  }
  return ['B1', 'B2', 'B3'].map(name => ({ scope: `foundation/${name}`, role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }));
}
/** Captures are evidence of exact inputs, never a substitute for inspecting their current bytes. */
export function run(place: string) {
  verifyRuntimeInventory('dependency/runtime-inventory');
  const bytes = readFileSync('samples/foundation/yes/client.json'), capture = JSON.parse(bytes.toString()) as Capture;
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);
  const selected = [...files('src'), ...files('test').filter(path => !independent.includes(path))].sort();
  if (!Array.isArray(capture.inputs) || capture.inputs.length !== selected.length || capture.inputs.some((f, i) => f.path !== selected[i] || digest(readFileSync(f.path)) !== f.sha256)) throw Error('REFUSE·foundation current inputs');
  if (policyOf(readFileSync('TARGET.bound', 'utf8')) !== capture.policy) throw Error('REFUSE·foundation policy moved');
  return place.replace(/\/$/, '') === 'samples/foundation/yes' ? observe(bytes) : [{ scope: 'foundation/current-inputs', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }];
}
