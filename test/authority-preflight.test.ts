import { test } from 'node:test';
import { deepStrictEqual, ok, match } from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';
import { join, dirname, basename, delimiter } from 'node:path';
import { createRequire } from 'node:module';
import { canonical } from '@lapxo/topos/wire';
import { decodeAuthorityCard, encodeAuthorityCard } from '@lapxo/topos/contract';
import { nativeHostInstrument, prepareNativeAuthorityCard } from '@lapxo/bound/host';
import { authorityAt, configureHost, hosting } from '../src/ports/host.ts';
import { factsOf, valueOf } from '../src/core/lock.ts';
import { fill } from '../src/core/surface.ts';
import { born, line, lock, text, said } from './place.ts';
import { run } from './cli.ts';
import { registryFor } from './signers.ts';
import { ask } from './client.ts';

const now = 1_792_800_000_000, budget = { bytes: 16_777_216, items: 65536 };
const fields = (place: string) => factsOf(readFileSync(join(place, 'TARGET.bound'), 'utf8').split('\n'));
const rooted = (p: ReturnType<typeof born>, rows: readonly string[]) => { const file = join(dirname(p.root), 'configuration.bound'); writeFileSync(file, rows.join('\n') + '\n'); const chained = fields(p.place).some(f => f.scope === 'keys/root' && f.measure === 'signer' && f.value === 'keychain'); const got = chained ? run('@lapxo/bound', p.place, ['land', file, '--key', 'root', '--signer', 'keychain'], { ...p.keychain.env, BOUND_SIGNERS: registryFor('keychain', 'test', `place/${basename(p.place)}/root`, 'root', 'ed25519:era1') }) : run('@lapxo/bound', p.place, ['land', file, '--key-file', p.root]); deepStrictEqual(got?.code, 0, got?.err.join('\n')); };
const coverage = (p: ReturnType<typeof born>, key: string, value: string) => {
  const old = fields(p.place).find(f => f.scope === `keys/${key}` && f.measure === 'coverage')!;
  const bare = Object.fromEntries(Object.entries(old).filter(([name]) => !['sig', 'epoch'].includes(name)));
  rooted(p, [canonical({ ...bare, by: 'target', value: 'withdraw' }), canonical({ ...bare, at: 'policy:fixture/changed-coverage', by: 'target', value })]);
};
const inventory = (dir: string): unknown => readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1).map(e => [e.name, e.isDirectory() ? inventory(join(dir, e.name)) : readFileSync(join(dir, e.name)).toString('base64')]);
configureHost(lock, { wait: 30000, most: budget.bytes });

for (const subject of ['catalog', 'route-notes']) {
  test(`configuration preflight is read only, exact and separate from Q4: ${subject}`, async () => {
    const p = born(undefined, [line('subject', 'id', subject)], null, false, subject, false), lot = [line(`settings/${subject}`, 'id', 'on')], before = inventory(p.place);
    const result = await authorityAt(p.place, 'root', 'record-coverage', lot, now);
    ok(!('refused' in result), JSON.stringify(result)); if ('refused' in result) return;
    deepStrictEqual(result.decision, 'allow'); deepStrictEqual(inventory(p.place), before);
    const replay = await authorityAt(p.place, 'root', 'record-coverage', lot, now, undefined, result.authority);
    ok(!('refused' in replay) && replay.decision === 'allow');
    for (const [kind, records] of [['execution', lot], ['aggregate', lot]] as const) {
      const refused = await authorityAt(p.place, 'root', kind, records, now);
      ok('refused' in refused && refused.code === 'not-in-card', JSON.stringify(refused));
    }
    const changed = await authorityAt(p.place, 'root', 'record-coverage', [line(`settings/${subject}`, 'id', 'changed')], now, undefined, result.authority);
    ok('refused' in changed || changed.decision !== 'allow', JSON.stringify(changed));
    const late = await authorityAt(p.place, 'root', 'record-coverage', lot, now + 1, undefined, result.authority);
    ok('refused' in late && ['card-stale', 'authority-preflight/failed'].includes(late.code) && /card-stale|authority-card\/clock/.test(late.refused), JSON.stringify(late));
    const absent = await authorityAt(p.place, 'root', 'record-coverage', lot, undefined as unknown as number);
    ok('refused' in absent, JSON.stringify(absent));
    const other = born(undefined, [line('subject', 'id', subject + '-other')], null, false, subject, false);
    const transplanted = await authorityAt(other.place, 'root', 'record-coverage', lot, now, undefined, result.authority);
    ok('refused' in transplanted || transplanted.decision !== 'allow', JSON.stringify(transplanted));
    const denied = await authorityAt(p.place, 'head', 'record-coverage', [line('keys/intruder', 'class', 'authorize')], now);
    ok(!('refused' in denied) && denied.decision === 'deny', JSON.stringify(denied)); if ('refused' in denied) return;
    const forged = decodeAuthorityCard(denied.authority, budget), forgedText = encodeAuthorityCard({ ...forged, actions: forged.actions.map(a => ({ ...a, decision: 'allow' })) }, budget);
    const checked = await authorityAt(p.place, 'head', 'record-coverage', [line('keys/intruder', 'class', 'authorize')], now, undefined, forgedText);
    ok('refused' in checked || checked.decision !== 'allow', JSON.stringify(checked));
    deepStrictEqual(inventory(p.place), before);
    const pin = hosting.installed; hosting.installed = `sha256:${'0'.repeat(64)}`;
    try { const bad = await authorityAt(p.place, 'root', 'record-coverage', lot, now); ok('refused' in bad && bad.refused.includes('instrument-pin')); } finally { hosting.installed = pin; }
  });

  test(`native epoch, changed coverage and independent admission remain Bound's: ${subject}`, async () => {
    const p = born(undefined, [line('subject', 'id', subject)], null, false, subject, false);
    const personLot = [line('allow/probe', 'id', 'yes')], headLot = [line('read/probe', 'id', 'seen')];
    const person = await authorityAt(p.place, 'person', 'record-coverage', personLot, now), head = await authorityAt(p.place, 'head', 'record-coverage', headLot, now);
    ok(!('refused' in person) && person.decision === 'allow', JSON.stringify(person)); ok(!('refused' in head) && head.decision === 'allow', JSON.stringify(head)); if ('refused' in person || 'refused' in head) return;
    coverage(p, 'person', 'other/**');
    const stale = await authorityAt(p.place, 'person', 'record-coverage', personLot, now, undefined, person.authority);
    ok('refused' in stale && stale.code === 'card-stale', JSON.stringify(stale));
    const denied = await authorityAt(p.place, 'person', 'record-coverage', personLot, now), unchanged = await authorityAt(p.place, 'head', 'record-coverage', headLot, now);
    ok(!('refused' in denied) && denied.decision === 'deny', JSON.stringify(denied)); ok(!('refused' in unchanged) && unchanged.decision === 'allow', JSON.stringify(unchanged));
    const globalStale = await authorityAt(p.place, 'head', 'record-coverage', headLot, now, undefined, head.authority);
    ok('refused' in globalStale && globalStale.code === 'card-stale', 'the grant is unchanged, but a snapshot card is global to the Root epoch');
    const instrumentRoot = dirname(createRequire(import.meta.url).resolve('@lapxo/bound/package.json')), instrument = nativeHostInstrument(instrumentRoot, join(instrumentRoot, 'dist/cli/verb.js'));
    const badEpoch = await prepareNativeAuthorityCard({ root: p.place, place: '.', key: 'root', instrument, authorityEpoch: 0, clock: { name: 'unix', unit: 'milliseconds', now }, horizon: { clock: 'unix', unit: 'milliseconds', from: now, through: now }, limits: budget, actions: [{ kind: 'record-coverage', records: personLot }] });
    ok(badEpoch.kind === 'refuse' && badEpoch.code === 'authority-preflight/stale-epoch', JSON.stringify(badEpoch));
    const lot = join(dirname(p.root), 'signed-lot.bound'); writeFileSync(lot, line('settings/probe', 'id', 'on') + '\n');
    const signed = run('@lapxo/bound', p.place, ['sign', lot, '--key', 'root', '--key-file', p.root]); deepStrictEqual(signed?.code, 0, signed?.err.join('\n'));
    const records = signed!.out.filter(l => l.startsWith('bound-lock/1'));
    const admission = await authorityAt(p.place, 'root', 'admission', records, now);
    ok(!('refused' in admission) && admission.decision === 'allow', JSON.stringify(admission));
    coverage(p, 'root', 'keys/**|other/**');
    writeFileSync(lot, records.join('\n') + '\n');
    const before = readFileSync(join(p.place, 'TARGET.bound')), actual = run('@lapxo/bound', p.place, ['land', lot]);
    ok(actual?.code !== 0, 'a preflight never grants the later act'); deepStrictEqual(readFileSync(join(p.place, 'TARGET.bound')), before);
  });
}

test('the public ask/card carrier exposes a configuration observation, never a new grant', async () => {
  const p = born(undefined, [], null, false, 'catalog', false), lot = line('settings/query', 'id', 'yes'), before = readFileSync(join(p.place, 'TARGET.bound'));
  const [answer] = await ask([{ method: 'tools/call', params: { name: 'card', arguments: { place: p.place, key: 'root', preflight: 'record-coverage', lines: lot } } }], [], p.keychain.env);
  const cell = answer.result.structuredContent.cells.find((c: any) => c.code === 'head/authority-card');
  ok(cell && cell.fields.decision === 'allow', text(answer)); deepStrictEqual(readFileSync(join(p.place, 'TARGET.bound')), before);
  ok(lock.some(l => l.scope === 'do/not-in-card/head' && l.value?.includes('not-allowed') && l.value.includes('secret-unallowed')));
});

const rootCapable = () => {
  const p = born(undefined, [], null, false, 'catalog', false);
  const wire = fields(p.place).find(f => f.scope === 'wire/fields')!;
  const bare = Object.fromEntries(Object.entries(wire).filter(([name]) => !['sig', 'epoch'].includes(name)));
  rooted(p, [canonical({ ...bare, by: 'target', value: 'withdraw' }), canonical({ ...bare, by: 'target', at: 'policy:fixture/witness', value: wire.value + '|witness' })]);
  const dir = p.keychain.env.PATH.split(delimiter)[0]!;
  const account = `place/${basename(p.place)}/root`.replaceAll('/', '_');
  writeFileSync(join(dir, `held-ANY--${account}`), createPrivateKey(readFileSync(p.root)).export({ type: 'pkcs8', format: 'der' }).toString('base64'));
  const signer = fields(p.place).find(f => f.scope === 'keys/root' && f.measure === 'signer')!;
  const old = Object.fromEntries(Object.entries(signer).filter(([name]) => !['sig', 'epoch'].includes(name)));
  rooted(p, [canonical({ ...old, by: 'target', value: 'withdraw' }), canonical({ ...old, by: 'target', at: 'policy:fixture/keychain', value: 'keychain' })]);
  return p;
};

test('a real Root plan is observed before consent, signed only after recheck, and admitted independently', async () => {
  const p = rootCapable();
  const [planned] = await ask([{ method: 'tools/call', params: { name: 'plan', arguments: { place: p.place, lines: line('settings/planned', 'id', 'on') } } }], [], p.keychain.env, () => ({ action: 'accept', content: { yes: true } }));
  match(text(planned), said('planned'));
  const lot = /lot="(sha256:[0-9a-f]+)"/.exec(text(planned))![1]!;
  const [landed] = await ask([{ method: 'tools/call', params: { name: 'land', arguments: { lot } } }], [], p.keychain.env);
  match(text(landed), said('landed'));
  ok(fields(p.place).some(f => f.scope === 'settings/planned' && f.by === 'root'));
});

test('a policy change during consent cannot authorize landing against the old base', async () => {
  const p = rootCapable(); let consent = 0;
  const [answer] = await ask([{ method: 'tools/call', params: { name: 'plan', arguments: { place: p.place, lines: line('settings/revoked', 'id', 'no') } } }], [], p.keychain.env, () => {
    consent += 1; coverage(p, 'root', 'keys/**|other/**'); return { action: 'accept', content: { yes: true } };
  });
  deepStrictEqual(consent, 1);
  match(text(answer), said('planned'));
  const lot = /lot="(sha256:[0-9a-f]+)"/.exec(text(answer))![1]!;
  const [landed] = await ask([{ method: 'tools/call', params: { name: 'land', arguments: { lot } } }], [], p.keychain.env);
  match(text(landed), said('base-moved'));
  ok(!fields(p.place).some(f => f.scope === 'settings/revoked'));
  const current = await authorityAt(p.place, 'root', 'record-coverage', [line('settings/revoked', 'id', 'no')], now);
  ok(!('refused' in current) && current.decision === 'allow', 'the original anchor retains Root authority; a local coverage declaration is not Root revocation');
});

test('cancelled or unknown-key observations fail closed without persisted output', async () => {
  const p = born(undefined, [], null, false, 'catalog', false), before = inventory(p.place), signal = AbortSignal.abort();
  const cancelled = await authorityAt(p.place, 'root', 'record-coverage', [line('settings/cancelled', 'id', 'no')], now, signal);
  ok('refused' in cancelled && /cancelled/.test(cancelled.refused));
  const unknown = await authorityAt(p.place, 'unknown', 'record-coverage', [line('settings/unknown', 'id', 'no')], now);
  ok('refused' in unknown || unknown.decision !== 'allow'); deepStrictEqual(inventory(p.place), before);
});
