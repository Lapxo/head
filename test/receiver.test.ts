import { test } from 'node:test';
import { deepStrictEqual, ok, throws } from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonical } from '@lapxo/topos/wire';
import { compose } from '../src/core/composition.ts';
import { associationFor, associationLines } from '../src/core/association.ts';
import { receiverQuestion, receiverConnect, receiverAllows } from '../src/core/receiver.ts';
import { publicAt } from '../src/ports/adapters/bundle.ts';
import type { Context } from '../src/core/answer.ts';
import { lock } from './place.ts';
const digest = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const doc = Buffer.from('{"openapi":"3.0.3"}'), pin = Buffer.from('public fixture\n'), source = { name: 'records', kind: 'compiled', document: digest(doc), pin: digest(pin), offers: ['lookup', 'change'] };
const recipe = { id: 'records-desk', revision: '1.0.0', title: 'Records', description: 'Public sources', sources: [{ source: 'records', namespace: 'records', offers: ['lookup'] }] };
const selection = compose(recipe, [source], 64).bytes, line = (scope: string, bytes: Uint8Array, needs: string) => canonical({ at: 'policy:fixture', by: 'target', form: 'alphabet', role: 'writes', measure: 'digest', scope, needs, value: digest(bytes) });
const packed = Buffer.from([line('sources/records', doc, 'connected/records.json'), line('uses/records', pin, 'compiled/records.bound')].join('\n') + '\n');
const files = () => new Map([['composition/selection.json', selection], ['composition/TARGET.bound', packed], ['composition/connected/records.json', doc], ['composition/compiled/records.bound', pin], ['manifest.json', Buffer.from(JSON.stringify({ name: recipe.id, version: recipe.revision }))]]);
const identity = { id: recipe.id, revision: recipe.revision, digest: digest(Buffer.from(JSON.stringify([digest(selection), digest(packed)]))) };
const ctx = (map = files(), index: readonly any[] = []) => ({ lock, packaged: async () => ({ root: '/installed', read: (path: string) => map.get(path) }), home: () => '/index', personal: () => '/person', files: { has: (place: string) => place === '/index' ? index.length > 0 : place === '/chosen' }, policy: async (place: string) => ({ lines: place === '/index' ? index : [{ scope: 'uses/records', value: source.pin }] }), elicit: async () => 'no' } as unknown as Context);
test('receiver: inspection and decline import no data, grants, keys or association', async () => {
  const context = ctx(), before = JSON.stringify(files());
  const asked = await receiverQuestion({}, context); ok(asked && 'said' in asked && asked.said[0]!.includes('head/bundle-receiver-ready'));
  const result = await receiverConnect({ document: '/installed/composition/TARGET.bound', digest: digest(packed) }, context); ok(result?.some(s => s.includes('head/no-yes')));
  deepStrictEqual(JSON.stringify(files()), before);
});
test('receiver: authenticated association routes only exact selected offers at its chosen place', async () => {
  const index = associationLines(associationFor('packages', identity, []), '/chosen', true, 'policy:fixture/choice');
  const { parse } = await import('@lapxo/topos/wire'); const rows = index.map(l => parse(l)).flatMap(p => p.kind === 'fact' ? [p.value.fields] : []);
  const selected = ctx(files(), rows); deepStrictEqual(await receiverQuestion({}, selected), { place: '/chosen' });
  ok(await receiverAllows(selected, '/chosen', 'records', 'lookup')); ok(!await receiverAllows(selected, '/chosen', 'records', 'change')); ok(!await receiverAllows(selected, '/other', 'records', 'lookup'));
});
test('receiver: corrupt public bytes and revision collisions refuse before consent or import', async () => {
  const changed = files(); changed.set('composition/connected/records.json', Buffer.from('changed'));
  const corrupted = await receiverQuestion({}, ctx(changed)); ok(corrupted && 'said' in corrupted && corrupted.said.some(s => s.includes('bundle/public-package')));
  const { parse } = await import('@lapxo/topos/wire'); const index = associationLines(associationFor('packages', { ...identity, digest: 'sha256:' + 'f'.repeat(64) }, []), '/chosen', true, 'policy:fixture/old').map(l => parse(l)).flatMap(p => p.kind === 'fact' ? [p.value.fields] : []);
  const got = await receiverQuestion({}, ctx(files(), index)); ok(got && 'said' in got && got.said.some(s => s.includes('bundle/revision-collision')));
});
test('receiver public port: budgets, path traversal and symlink members refuse; absent selection is inert', () => {
  const root = mkdtempSync(join(tmpdir(), 'head-public-')); mkdirSync(join(root, 'composition')); writeFileSync(join(root, 'composition/value.json'), 'data');
  try { const port = publicAt(root, 4); deepStrictEqual(port.read('composition/value.json'), Buffer.from('data')); throws(() => port.read('../private'), /public-path/); throws(() => publicAt(root, 3).read('composition/value.json'), /public-budget/);
    symlinkSync(join(root, 'composition/value.json'), join(root, 'composition/link.json')); throws(() => publicAt(root, 4).read('composition/link.json'), /public-path/); deepStrictEqual(publicAt(root, 4).read('composition/selection.json'), undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
