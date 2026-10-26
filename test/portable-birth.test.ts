import { test } from 'node:test';
import { deepStrictEqual, ok, match } from 'node:assert/strict';
import { canonical } from '@lapxo/topos/wire';
import { decodePortableBirth, encodePortableBirth } from '@lapxo/topos/contract';
import { receivedBirth, sharedBirth } from '../src/links/birth.ts';
import type { Context } from '../src/core/answer.ts';
import { lock, line, born } from './place.ts';
import { factsOf } from '../src/core/lock.ts';
import { digestOf } from './share-fixture.ts';
import { run } from './cli.ts';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const budget = { bytes: 16_777_216, items: 64 };
const declaration = (scope: string, value: string, more: Record<string, string> = {}) => canonical({ at: 'policy:public/birth', form: 'alphabet', measure: 'id', role: 'writes', scope, value, ...more });
const fixtures = (name: string, language: string) => {
  const files = new Map<string, Uint8Array>(), actions: string[] = [];
  const policy = factsOf([line('lang', 'id', language), line('keys/root', 'public-key', 'never-export-this-key'), line('allow/read', 'sources', 'private-source')]);
  const forbidden = () => { actions.push('authority'); throw Error('inspection acquired authority'); };
  const context = { lock, roots: async () => ['/shared'], policy: async () => ({ lines: policy }), files: { lay: (dir: string, file: string, bytes: Uint8Array) => files.set(dir + '/' + file, bytes), read: { documentOf: async (_c: unknown, _p: string, file: string) => files.has(file) ? { bytes: files.get(file), kind: 'topos' } : undefined } }, landRoot: forbidden, signRoot: forbidden, found: forbidden, get keys() { return forbidden(); }, get device() { return forbidden(); } } as unknown as Context;
  return { name, files, actions, policy, context };
};

test('portable birth is a separate unsigned declaration artifact in two unrelated contexts; inspection never installs authority', async () => {
  for (const [name, language] of [['catalog', 'en'], ['route-notes', 'es']] as const) {
    const source = fixtures(name, language), messages = sharedBirth(source.context, '/shared', source.policy), bytes = source.files.get('/shared/birth.topos')!;
    ok(messages[0]?.startsWith('said/head/birth-shared '));
    const pack = decodePortableBirth(new TextDecoder().decode(bytes), budget);
    deepStrictEqual(pack.declarations.map(l => factsOf([l])[0]!.scope), ['lang']);
    ok(!new TextDecoder().decode(bytes).includes('never-export-this-key'));
    const target = fixtures(name + '-receiver', 'fr'), before = JSON.stringify(target.policy);
    for (const record of [new TextDecoder().decode(bytes), '/shared/birth.topos']) {
      target.files.set('/shared/birth.topos', bytes);
      const result = await receivedBirth({ place: '/' + target.name, document: record, digest: digestOf(Buffer.from(bytes)) }, target.context);
      match(result!.join('\n'), /said\/head\/birth-inspected .*collisions="lang"/);
      deepStrictEqual([target.actions, JSON.stringify(target.policy)], [[], before]);
    }
  }
});

test('portable birth rejects authority material, consumer-specific grants, spoofed scopes, altered bytes and wrong profiles', async () => {
  const to = fixtures('receiver', 'en');
  for (const scope of ['keys/root', 'allow/read', 'access/api', 'admit/other']) {
    let record: string;
    try { record = encodePortableBirth({ origin: digestOf('declared'), declarations: [declaration(scope, 'yes', { about: ' scope=lang ' })] }, budget); }
    catch { continue; }
    match((await receivedBirth({ place: '/receiver', document: record }, to.context))!.join('\n'), /(?:said\/head\/birth-refused |head="head\/birth-refused")/);
  }
  const valid = encodePortableBirth({ origin: digestOf('declared'), declarations: [declaration('lang', 'en')] }, budget);
  match((await receivedBirth({ place: '/receiver', document: valid, digest: digestOf('other') }, to.context))!.join('\n'), /said\/head\/document-digest /);
  match((await receivedBirth({ place: '/receiver', document: valid.replace('birth/1', 'birth/2') }, to.context))!.join('\n'), /(?:said\/head\/birth-refused |head="head\/birth-refused")/);
  match((await receivedBirth({ place: '/receiver', document: '/shared/birth.topos' }, to.context))!.join('\n'), /said\/head\/birth-needs /);
  deepStrictEqual(to.actions, []);
});

test('a portable declaration is inert until a receiver makes its ordinary local admission under its own key', () => {
  for (const name of ['catalog', 'route-notes']) {
    const p = born(undefined, [line('lang', 'id', 'en'), line('subject', 'id', name)], null, false);
    const record = encodePortableBirth({ origin: digestOf(name), declarations: [declaration('lang', 'es')] }, budget), before = readFileSync(join(p.place, 'TARGET.bound'));
    const pack = decodePortableBirth(record, budget);
    deepStrictEqual(readFileSync(join(p.place, 'TARGET.bound')), before);
    const lot = join(p.place, 'local-proposal.bound');
    writeFileSync(lot, [line('lang', 'id', 'withdraw'), canonical({ ...factsOf(pack.declarations)[0], by: 'target' })].join('\n') + '\n');
    const admitted = run('@lapxo/bound', p.place, ['land', lot, '--key-file', p.root]);
    deepStrictEqual(admitted?.code, 0, admitted?.err.join('\n'));
  }
});
