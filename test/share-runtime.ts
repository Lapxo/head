import { run as verifyRuntimeInventory } from './runtime-inventory.ts';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonical, parse } from '@lapxo/topos/wire';
const hash = (bytes: Uint8Array | string) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const fields = (bytes: string) => bytes.split('\n').filter(Boolean).map(line => parse(line)).flatMap(p => p.kind === 'fact' ? [p.value.fields] : []);
const policyOf = (bytes: string) => hash(fields(bytes).filter(f => f.scope?.startsWith('share/') || f.scope?.startsWith('tool/share') || f.scope?.startsWith('said/bundle-') || ['tool/do/to', 'bound/wait', 'bound/printed', 'dep/runtime-bundle'].includes(f.scope ?? '')).map(({ sig, epoch, by, at, ...f }) => canonical(f)).sort().join('\n') + '\n');
/** Current producer bytes and reviewed real consumer receipts; no consumer execution or artifact re-read is implied. */
export function run(place: string) {
  verifyRuntimeInventory('dependency/runtime-inventory');
  const bytes = readFileSync('samples/share-runtime/yes/client.json');
  if (hash(bytes) !== 'sha256:dadf38bee5b9bf6b5b2901d972575c89f0a2d955d910e9acbbacfb048f9356ce') throw Error('REFUSE·share-runtime capture digest');
  const capture = JSON.parse(bytes.toString());
  if (capture.protocol !== 'head-share-runtime-capture@1' || capture.runs.length !== 2 || new Set(capture.runs.map((r: { node: string }) => r.node)).size !== 2) throw Error('REFUSE·share-runtime capture');
  for (const input of capture.inputs) if (hash(readFileSync(input.path)) !== input.sha256) throw Error('REFUSE·share-runtime current input ' + input.path);
  if (hash(readFileSync('runtime.bundle.json')) !== capture.runtimeInventory || !capture.policySnapshots?.includes(policyOf(readFileSync('TARGET.bound', 'utf8')))) throw Error('REFUSE·share-runtime policy or inventory');
  const rows = [];
  for (const run of capture.runs) {
    if (!['22', '24'].includes(run.node) || !/^(?:# |ℹ )pass 7$/m.test(run.units) || !/^(?:# |ℹ )fail 0$/m.test(run.units) || !/^(?:# |ℹ )pass 14$/m.test(run.surface) || !/^(?:# |ℹ )fail 0$/m.test(run.surface)) throw Error('REFUSE·share-runtime incomplete vectors');
    for (const key of ['threePublicTools', 'emptyBaseExported', 'emptyExportBoots', 'runtimeInventoryRetained', 'apiConnectedThroughExistingFlow', 'selectedApiExported', 'independentBundleIdentity', 'senderCanaryAbsent', 'privateStateAbsent', 'currentRuntimeByteCorruptionRefused']) if (run.consumer[key] !== true) throw Error('REFUSE·share-runtime consumer ' + key);
    if (!Number.isSafeInteger(run.budget.publicPayloadBytes) || run.budget.publicPayloadBytes < 0 || run.budget.selectionCount !== 1 || run.budget.maximumSelectionListItems !== 1 || run.budget.customArtifact !== run.consumer.customArtifact.digest || hash(JSON.stringify(run.consumer, null, 2) + '\n') !== run.budget.parentSummaryDigest) throw Error('REFUSE·share-runtime budget evidence');
    for (const [scope, measure, value] of [['share/bundle-bytes/node-' + run.node, 'share-public-bytes', run.budget.publicPayloadBytes], ['share/bundle-selections/node-' + run.node, 'share-selections', run.budget.maximumSelectionListItems]] as const) rows.push({ scope, role: 'writes', measure, bound: { kind: 'interval', lo: value, hi: value } });
  }
  return place.replace(/\/$/, '') === 'samples/share-runtime/yes' ? [...rows, { scope: 'composition/share-runtime', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }] : [{ scope: 'share-runtime/current-inputs', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }];
}
