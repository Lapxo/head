import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical } from '@lapxo/topos/wire';
import { pinIn } from '../src/compile/pin.ts';
import { vocabOf } from '../src/core/read.ts';
import { linesOf } from '../src/core/worlds.ts';
import { lockAt } from '../src/ports/place.ts';
import type { Context } from '../src/core/answer.ts';
const lock = lockAt(new URL('..', import.meta.url).pathname), v = vocabOf(lock);
test('source policy pin excludes host output presence and retains source bounds in unrelated places', async () => {
  const pins: string[] = [];
  for (const receiptPresent of [false, true]) {
    const files = new Map<string, Uint8Array>();
    const world = [{ scope: `${v.region}/records`, measure: 'origins', value: 'https://records.example' },
      { scope: `${v.offers}/records/lookup`, measure: v.class, value: v.callable },
      { form: 'interval', scope: 'read/pages', measure: 'pages', value: '0..1' },
      ...(receiptPresent ? [{ scope: 'write/receipts.bound', measure: 'fact', value: 'present' }] : [])].map(l => ({ at: 'place:fixture', form: 'alphabet', role: 'writes', ...l }));
    const context = { lock, policy: async () => ({ lines: [] }), world: async () => ({ lines: world }), now: () => 0,
      files: { take: (p: string) => files.get(p), lay: (place: string, p: string, b: Uint8Array) => files.set(place + '/' + p, b), drop: (place: string, p: string) => files.delete(place + '/' + p) },
      pinned: async (place: string, p: string) => { const bytes = Buffer.from(files.get(place + '/' + p)!); return { pin: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), bytes: bytes.toString(), lines: linesOf(bytes) }; }
    } as unknown as Context;
    const result = await pinIn(context, receiptPresent ? '/second' : '/first', async () => ({ lines: [] }), (scope, measure, value, more) => canonical({ scope, measure, value, ...more }))('records', ['same observed input']);
    ok('pin' in result); pins.push(result.pin);
    ok(result.lines.some(l => l.scope === 'read/pages' && l.value === '0..1'));
    ok(!result.lines.some(l => l.scope === 'write/receipts.bound'));
  }
  deepStrictEqual(pins[0], pins[1]);
});
