import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { cooled, hosted, hosting, hostOf, signedIn } from '../src/ports/host.ts';
import { portOf } from '../src/ports/keychain.ts';
import { valueOf } from '../src/core/lock.ts';
import { asked, twins } from './warm.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostWorlds } from './worlds.ts';
import { born, line, lock } from './place.ts';

test('host: one fold host a place, never shared — two places read, two hosts; and a host only folds: a sign handed to it is refused by name, and no host is started for it', async () => {
  const { copies: [a, b, c], env } = twins(3);
  try {
    await asked('warm', a!, ['fold', '--as', 'lines'], env); await asked('warm', b!, ['fold', '--as', 'lines'], env);
    ok(hostOf(a!) !== undefined && hostOf(b!) !== undefined && hostOf(a!) !== hostOf(b!), 'two places, two hosts');
    const signed = await hosted(c!, ['sign', 'lot.bound', '--key', 'person', '--signer', 'keychain']);
    deepStrictEqual([signed.code, /^REFUSE·host a place's fold host only folds, and never holds a signer/.test(signed.err[0] ?? ''), hostOf(c!)], [-1, true, undefined]);
  } finally { cooled(); }
});

test('a sign in a host of its own for the call: a key the place does not know, and one head binds no signer for, are each refused by name and no signer is started; the bound key signs, and once it answers neither a host nor a signer is left', async () => {
  const { copies: [a], env } = twins(1), kind = valueOf(lock, `platform/${process.platform}/store`);
  process.env['PATH'] = env.PATH;
  let started = 0;
  const port: ReturnType<typeof portOf> = async (lot, signal) => { started += 1; return portOf('@lapxo/head', 'person', kind, 60_000)(lot, signal); };
  const signers = new Map([['person', { name: 'keychain', sign: port }], ['ghost', { name: 'keychain', sign: port }]]), lot = [line('allow/read', 'until', '2999-12-30')];
  const [ghost, unbound] = [await signedIn(a!, ['sign', '--key', 'ghost', '--signer', 'keychain'], lot, signers, 'ghost'), await signedIn(a!, ['sign', '--key', 'head', '--signer', 'keychain'], lot, signers, 'head')];
  deepStrictEqual([ghost.code !== 0, /unknown key ghost/.test(ghost.err.join('\n')), unbound.code !== 0, /host\/unbound-signer/.test(unbound.err.join('\n')), started], [true, true, true, true, 0], 'a key the place does not know, and one it knows that head binds no signer for: each refused by name, and no signer started');
  const signed = await signedIn(a!, ['sign', '--key', 'person', '--signer', 'keychain'], lot, signers, 'person');
  deepStrictEqual([signed.code, started, signed.out.some((l) => / sig="ed25519:/.test(l)), hostOf(a!)], [0, 1, true, undefined], signed.err.join('\n'));
});

test('host sources: two unrelated documents read a pinned world through explicit HTTPS trust; corrupt bytes refuse without reusing the old result', async () => {
  const served = await hostWorlds(hosting.http?.redirects), previous = hosting.http;
  hosting.http = served.policy;
  const standing = valueOf(lock, 'world/topos-openapi/standing'), blob = valueOf(lock, 'world/topos-openapi/blob');
  try {
    for (const name of ['denied', 'weather', 'inventory', 'altered']) {
      hosting.http = name === 'denied' ? { ...served.policy, redirects: undefined } : served.policy;
      const { place } = born(undefined, [line('wire/region-measures', 'id', 'coordinates', { role: 'reads' }), line('lang', 'id', 'en'),
        line('uses/topos-openapi', 'digest', standing), line('sources/topos-openapi', 'id', served.url(standing)),
        line('dep/topos-openapi-blob', 'digest', blob, { shape: 'dist/index.js' }), line('sources/topos-openapi-blob', 'id', served.url(blob)),
        line('region/spec', 'coordinates', 'api/*', { role: 'reads' }), line('region/spec', 'receipts', 'openapi/**', { role: 'reads' }),
        line('view/forms', 'id', 'endpoints@1', { role: 'demands' })], null, false);
      mkdirSync(join(place, 'api')); writeFileSync(join(place, 'api', `${name}.json`), JSON.stringify({ openapi: '3.0.3', info: { title: name, version: '1' }, paths: { [`/${name}`]: { get: { operationId: `read-${name}`, security: [], responses: { 200: { description: 'ok' } } } } } }));
      if (name === 'altered') served.corrupt();
      const before = served.seen.length, got = await hosted(place, ['fold', '--as', 'forms']);
      if (name === 'denied') { ok(got.code !== 0); ok([...got.out, ...got.err].join('\n').includes('redirect not admitted')); }
      else if (name === 'altered') { ok(got.code !== 0, JSON.stringify(got)); ok(!got.out.join('\n').includes('read-altered')); ok(/digest|integrity/i.test([...got.out, ...got.err].join('\n')), JSON.stringify(got)); }
      else { deepStrictEqual(got.code, 0, got.err.join('\n')); ok(got.out.join('\n').includes(`read-${name}`), got.out.join('\n')); }
      ok(served.seen.length > before, 'the host fetched the world through HTTPS, not a fetch preload');
      cooled();
    }
  } finally { cooled(); hosting.http = previous; await served.close(); }
});
