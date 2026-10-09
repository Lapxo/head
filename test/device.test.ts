import { test } from 'node:test';
import { deepStrictEqual, match } from 'node:assert';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical } from '@lapxo/topos/wire';
import { fileURLToPath } from 'node:url';
import { admissionOf } from '../src/core/device.ts';
import { newKey } from '../src/core/keys.ts';
import { lockAt } from '../src/ports/place.ts';
import { run } from './cli.ts';
import { registryFor } from '../src/ports/signers.ts';
import { fakeKeychain } from './fake-keychain.ts';

const lock = lockAt(fileURLToPath(new URL('..', import.meta.url)));
/** What head-s own lock says every place must declare before anything lands in it: the wire, the host vocabulary and the local journals. */
const prelude = lock.filter((l) => l.scope?.startsWith('wire/') || l.scope === 'keys/reader' || l.scope === 'keys/fold' || l.scope?.startsWith('signer/')).map((l) => canonical({ ...l, at: 'policy:fixture' }));

/** A place born from nothing with a fixture root key, admitting head's device key for read/** through its keychain signer. */
const born = () => {
  const place = mkdtempSync(join(tmpdir(), 'head-device-'));
  mkdirSync(join(place, '.bound'));
  const root = generateKeyPairSync('ed25519');
  writeFileSync(join(place, '..', `${place.split('/').at(-1)}.pem`), root.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const head = newKey();
  const f = (scope: string, measure: string, value: string, more: Record<string, string> = {}) => canonical({ at: 'policy:fixture', by: 'target', form: 'alphabet', measure, role: 'writes', scope, value, ...more });
  writeFileSync(join(place, 'TARGET.bound'), [
    f('keys/root', 'class', 'authorize'), f('keys/root', 'coverage', '*'), f('keys/root', 'signer', 'file'),
    f('keys/root', 'public-key', root.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')),
    ...admissionOf(lock, head.publicKey),
    ...prelude.filter((l) => !/ scope=wire\/(signature-algorithms|era) /.test(l)),
    f('wire/signature-algorithms', 'id', 'ed25519:fixture', { role: 'reads' }), f('wire/era', 'id', 'fixture', { role: 'reads' }),
  ].join('\n') + '\n');
  const first = run('@lapxo/bound', place, ['land', '--key-file', join(place, '..', `${place.split('/').at(-1)}.pem`)])!;
  const env = { ...fakeKeychain({ head: head.secret }).env, BOUND_SIGNERS: registryFor('keychain', '@lapxo/head', 'head', 'head', 'ed25519:fixture') };
  return { place, first, env };
};
const lotOf = (place: string, scope: string) => ((at) => { writeFileSync(at, `${canonical({ at: 'receipt:a-read-head-made', by: 'target', form: 'alphabet', measure: 'digest', role: 'writes', scope, value: `sha256:${'0'.repeat(64)}` })}\n`); return at; })(join(place, `${scope.replaceAll('/', '-')}.lot`));
const signAndLand = (place: string, env: Readonly<Record<string, string>>, scope: string) => {
  const signed = run('@lapxo/bound', place, ['sign', lotOf(place, scope), '--key', 'head', '--signer', 'keychain'], env)!;
  writeFileSync(join(place, 'signed.bound'), `${signed.out.join('\n')}\n`);
  return { signed, landed: run('@lapxo/bound', place, ['land', join(place, 'signed.bound')], env)! };
};

test('head-s device key signs through its keychain signer and a read lands in the place that admits it', () => {
  const { place, first, env } = born();
  match(first.out.join('\n'), /FACT +landed \d+ unique lines/);
  const { signed, landed } = signAndLand(place, env, 'read/api/example');
  deepStrictEqual([signed.code, landed.code, landed.err], [0, 0, []]);
  match(signed.err.join('\n'), /^SIGNED +1 lines/);
  match(landed.out.join('\n'), /FACT/);
});

test('no: the same key is refused a line outside read/**: bound will not deliver its signature, and nothing lands', () => {
  const { place, env } = born();
  const { signed, landed } = signAndLand(place, env, 'write/api/example');
  deepStrictEqual([signed.code, signed.out, landed.code === 0], [1, [], false]);
  match(signed.err.join('\n'), /REFUSE·signer head uncovered write\/api\/example/);
});
