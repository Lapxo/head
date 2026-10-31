import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonical, parse } from '@lapxo/topos/wire';
const hash = (bytes: Uint8Array | string) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const rows = (text: string) => text.split('\n').filter(Boolean).map(line => parse(line)).flatMap(p => p.kind === 'fact' ? [p.value.fields] : []);
/** Verify current declared bytes and an executed installed-consumer receipt; no expected runtime digest is learned from an installation. */
export function run(place: string) {
  const capture = readFileSync('samples/runtime-inventory/yes/client.json');
  if (hash(capture) !== 'sha256:1b3b3065471a293bd41f4893ba7e4c06ec334afb0d612934db765663def458bb') throw Error('REFUSE·runtime-inventory/capture');
  const receipt = JSON.parse(capture.toString());
  if (receipt.protocol !== 'head-runtime-inventory-capture@1' || receipt.runs.length !== 2 || receipt.runs.map((r: { node: string }) => r.node).sort().join('|') !== '22|24') throw Error('REFUSE·runtime-inventory/runtimes');
  for (const input of receipt.inputs) if (hash(readFileSync(input.path)) !== input.sha256) throw Error('REFUSE·runtime-inventory/current-input');
  const original = readFileSync('samples/runtime-inventory/yes/original.json'), current = readFileSync('runtime.bundle.json');
  if (hash(original) !== 'sha256:f20d82a86d78a47086e5d043def1be3799d9132922c6227cfbc6186fdd6233cc' || hash(current) !== receipt.inventory) throw Error('REFUSE·runtime-inventory/pin');
  const before = JSON.parse(original.toString()), after = JSON.parse(current.toString()), removed = before.files.filter((m: { path: string }) => m.path === 'node_modules/.package-lock.json');
  const changes = receipt.runtimeChanges as { path: string; before: unknown; after: { path: string; bytes: number; digest: string } }[];
  if (!Array.isArray(changes) || new Set(changes.map(c => c.path)).size !== changes.length) throw Error('REFUSE·runtime-inventory/changes');
  let expectedBytes = before.bytes - (removed[0]?.bytes ?? 0), applied = 0;
  const expected = before.files.filter((m: { path: string }) => m.path !== 'node_modules/.package-lock.json').map((member: { path: string; bytes: number }) => {
    const change = changes.find(c => c.path === member.path);
    if (!change) return member;
    if (JSON.stringify(change.before) !== JSON.stringify(member) || change.after.path !== member.path || !Number.isSafeInteger(change.after.bytes) || change.after.bytes < 0 || !/^sha256:[a-f0-9]{64}$/.test(change.after.digest)) throw Error('REFUSE·runtime-inventory/change');
    applied++; expectedBytes += change.after.bytes - member.bytes; return change.after;
  });
  const additions = receipt.runtimeAdditions as { path: string; bytes: number; digest: string }[];
  if (!Array.isArray(additions) || new Set(additions.map(m => m.path)).size !== additions.length || additions.some(m => !/^dist\/src\/[a-z0-9/-]+\.js$/.test(m.path) || expected.some((old: { path: string }) => old.path === m.path) || !Number.isSafeInteger(m.bytes) || m.bytes < 0 || !/^sha256:[a-f0-9]{64}$/.test(m.digest))) throw Error('REFUSE·runtime-inventory/additions');
  expected.push(...additions); expectedBytes += additions.reduce((n, m) => n + m.bytes, 0);
  if (before.protocol !== 'head-runtime-closure@1' || before.files.length !== 4804 || removed.length !== 1 || after.protocol !== before.protocol || applied !== changes.length || after.bytes !== expectedBytes || JSON.stringify(after.files) !== JSON.stringify(expected)) throw Error('REFUSE·runtime-inventory/delta');
  const policy = rows(readFileSync('TARGET.bound', 'utf8'));
  if (policy.filter(f => f.scope === 'dep/runtime-bundle' && f.value === hash(current)).length !== 1 || hash(policy.filter(f => f.form === 'interval' && ['share/bundle-bytes', 'share/bundle-selections', 'bound/wait', 'bound/printed'].includes(f.scope ?? '')).map(({ sig, epoch, by, at, ...f }) => canonical(f)).sort().join('\n')) !== receipt.policy) throw Error('REFUSE·runtime-inventory/policy');
  for (const r of receipt.runs) {
    if (!/^(?:# |ℹ )pass 33$/m.test(r.focused) || !/^(?:# |ℹ )fail 0$/m.test(r.focused)) throw Error('REFUSE·runtime-inventory/root-path-tests');
    if (r.noExpectedDigestsRegenerated !== true || r.credentialsUsed !== false || r.externalApiCalled !== false || r.results.length !== 2 || r.results.map((c: { metadata: string }) => c.metadata).sort().join('|') !== 'absent|changed') throw Error('REFUSE·runtime-inventory/consumer');
    for (const c of r.results) if (!c.exportedTwice || !c.exportedReceiverBooted || !c.fixedInventoryUnchanged || !c.realRuntimeByteCorruptionRefused || !c.privateCanaryAbsent || !c.identicalMemberContents || c.allRuntimeMembersVerified !== after.files.length || c.artifacts.length !== 2) throw Error('REFUSE·runtime-inventory/vector');
  }
  return [{ scope: place.replace(/\/$/, '').includes('samples/runtime-inventory/yes') ? 'composition/runtime-inventory' : 'runtime-inventory/current-inputs', role: 'writes', measure: 'defects', bound: { kind: 'interval' as const, lo: 0, hi: 0 } }];
}
