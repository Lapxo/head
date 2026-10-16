import { test } from 'node:test';
import { deepStrictEqual, match } from 'node:assert';
import type { Said } from '../src/core/lock.ts';
import { trustOf } from '../src/core/trust.ts';
import { ask } from './client.ts';
import { born, lock, said, text } from './place.ts';

const flow = (source: string, name: string, measure: string, value: string, by = 'root'): Said => ({ scope: `keys/access/${source}/${name}`, measure, value, by });

test('a source-s access is shown in the order of trust — a flow that asks no secret, then one that asks a one-time code, then one that asks a secret — with how many secrets the place-s root lets a flow ask', () => {
  const lines = [flow('s', 'key', 'asks', 'secret'), flow('s', 'otp', 'asks', 'form|one-time'), flow('s', 'visit', 'type', 'oauth2/authorizationCode'), { scope: 'access/secret-inputs', measure: 'count', value: '0..1', by: 'root' }];
  const [line] = trustOf(lock, lines, 's');
  match(line!, said('trust'));
  match(line!, /visit asks no secret; otp asks a one-time code; key asks a secret\. .* 1 on head-s page/);
  deepStrictEqual(trustOf(lock, [flow('s', 'key', 'asks', 'secret')], 'other'), [], 'a source that proves no access says nothing');
});

test('no: a ceiling no root signed lets no secret through — the place allows none until its root says otherwise', () => {
  const [line] = trustOf(lock, [flow('s', 'key', 'asks', 'secret'), { scope: 'access/secret-inputs', measure: 'count', value: '0..3', by: 'person' }], 's');
  match(line!, / 0 on head-s page/);
});

test('looking at what a source offers shows its access in the order of trust', async () => {
  const { place, keychain } = born(undefined);
  const [offered] = await ask([{ method: 'tools/call', params: { name: 'look', arguments: { place, source: 'tracker', at: '1' } } }], [], keychain.env);
  match(text(offered), /How tracker proves access, the most trusted first: oauth asks no secret; [a-z0-9]+ asks a secret/);
  match(text(offered), / 0 on head-s page/);
});
