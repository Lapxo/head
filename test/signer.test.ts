import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signedBytes, signerResponseOf } from '@lapxo/topos/wire';
import { newKey } from '../src/core/keys.ts';
import { fakeKeychain } from './fake-keychain.ts';

const signer = fileURLToPath(new URL('../src/signer.ts', import.meta.url));
const bytes = [signedBytes({ at: 'policy:t', by: 'head', form: 'alphabet', measure: 'digest', role: 'writes', scope: 'read/a', value: 'sha256:00' })];
const ask = (env: Readonly<Record<string, string>>) => spawnSync(process.execPath, [signer, '@lapxo/head', 'head', 'head', 'ed25519:era1'], { input: `${bytes.join('\n')}\n`, encoding: 'utf8', env: { ...process.env, ...env } });

test('the signer program answers a lot from the key the keychain holds, and nothing else crosses', () => {
  const got = ask(fakeKeychain({ head: newKey().secret }).env);
  deepStrictEqual([got.status, signerResponseOf(got.stdout, { bytes, keyId: 'head', algorithm: 'ed25519:era1' }).length, got.stderr], [0, 1, '']);
});

test('with no key in the keychain the signer refuses and prints nothing', () => {
  const got = ask(fakeKeychain({ head: undefined }).env);
  deepStrictEqual([got.status, got.stdout, got.stderr], [1, '', '']);
});
