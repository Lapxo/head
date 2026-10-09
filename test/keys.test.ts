import { test } from 'node:test';
import { deepStrictEqual, ok, throws } from 'node:assert';
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { signedBytes, signerResponseOf } from '@lapxo/topos/wire';
import { newKey, signLot } from '../src/core/keys.ts';

const key = newKey();
const lot = (by: string, scopes: readonly string[]) => scopes.map((scope) => signedBytes({ at: 'policy:t', by, form: 'alphabet', measure: 'digest', role: 'writes', scope, value: 'sha256:00' }));
const vector = JSON.parse(readFileSync(new URL('../node_modules/@lapxo/topos/vectors/signing-port.json', import.meta.url), 'utf8')) as { cases: { inputBy: string; responseBy: string; valid: boolean }[] };

test('a lot head signs is read back by topos as its own response, and every signature holds for the public half', () => {
  const bytes = lot('head', ['read/a', 'read/b']);
  const replies = signerResponseOf(signLot(`${bytes.join('\n')}\n`, key.secret, 'head', 'ed25519:era1'), { bytes, keyId: 'head', algorithm: 'ed25519:era1' });
  const pub = createPublicKey({ key: Buffer.from(key.publicKey, 'base64'), format: 'der', type: 'spki' });
  deepStrictEqual(replies.map((r) => r.keyId), ['head', 'head']);
  ok(replies.every((r, i) => verify(null, Buffer.from(bytes[i]!, 'utf8'), pub, Buffer.from(r.signature.split(':').at(-1)!, 'base64'))));
});

test('a lot that names another key, or bytes out of their canonical form, is refused whole', () => {
  throws(() => signLot(`${lot('owner', ['read/a']).join('\n')}\n`, key.secret, 'head', 'ed25519:era1'));
  throws(() => signLot(`${lot('head', ['read/a'])[0]!.replace(' ', '  ')}\n`, key.secret, 'head', 'ed25519:era1'));
  throws(() => signLot('', key.secret, 'head', 'ed25519:era1'));
});

test('signing-lot/1: a response is valid only when it names the key that was asked', () => {
  for (const one of vector.cases) {
    const bytes = lot(one.inputBy, ['read/a']);
    const answered = signLot(`${bytes.join('\n')}\n`, key.secret, one.inputBy, 'ed25519:era1').replace(`by=${one.inputBy}`, `by=${one.responseBy}`);
    const valid = (() => { try { signerResponseOf(answered, { bytes, keyId: one.inputBy, algorithm: 'ed25519:era1' }); return true; } catch { return false; } })();
    deepStrictEqual([one.inputBy, one.responseBy, valid], [one.inputBy, one.responseBy, one.valid]);
  }
});
