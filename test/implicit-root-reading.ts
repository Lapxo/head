import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse, canonical } from '@lapxo/topos/wire';
const hash = (x: Uint8Array | string) => 'sha256:' + createHash('sha256').update(x).digest('hex');
/** Current-byte projection of reviewed native index/selection vectors; authority remains Bound's judgment. */
export function run(place: string) {
  const bytes = readFileSync('samples/implicit-root/yes/client.json');
  if (hash(bytes) !== 'sha256:e8a2bf38ba365c299a98d737b5e9fb44eab82cb99f29aa095d30912e2b8ab2d0') throw Error('REFUSE·implicit-root/capture');
  const c = JSON.parse(bytes.toString());
  for (const i of c.inputs) if (hash(readFileSync(i.path)) !== i.sha256) throw Error('REFUSE·implicit-root/current-input ' + i.path);
  const fields = readFileSync('TARGET.bound', 'utf8').split('\n').map(line => parse(line)).flatMap(p => p.kind === 'fact' ? [p.value.fields] : []);
  const policy = fields.filter(f => c.policyScopes.includes(f.scope)).map(({ at, by, sig, epoch, ...f }) => canonical(f)).sort().join('\n');
  if (hash(policy) !== c.policy || fields.filter(f => f.scope === 'dep/runtime-bundle' && f.value === c.runtimeInventory).length !== 1) throw Error('REFUSE·implicit-root/policy');
  if (c.protocol !== 'head-implicit-root-capture@1' || c.runs.length !== 2 || c.runs.map((r: any) => r.node).sort().join('|') !== '22|24') throw Error('REFUSE·implicit-root/runtimes');
  for (const r of c.runs) {
    if (!/^(?:# |ℹ )pass 2$/m.test(r.focused) || !/^(?:# |ℹ )fail 0$/m.test(r.focused) || r.installed.runs.length !== 2) throw Error('REFUSE·implicit-root/incomplete');
    for (const d of r.installed.runs) for (const key of c.checks) if (d[key] !== true) throw Error('REFUSE·implicit-root/vector ' + key);
    if (r.installed.RootModified || r.installed.BoundModified || r.installed.signed || r.installed.published) throw Error('REFUSE·implicit-root/boundary');
  }
  return (place.replace(/\/$/, '') === 'samples/implicit-root/yes' ? ['receiver/root-choice-defects', 'receiver/index-refusal-defects'] : ['implicit-root/current-inputs']).map(scope => ({ scope, role: 'writes', measure: 'defects', bound: { kind: 'interval' as const, lo: 0, hi: 0 } }));
}
