import { test } from 'node:test';
import { deepStrictEqual, match } from 'node:assert/strict';
import { paidIn } from '../src/onboard/owed.ts';
import type { Context } from '../src/core/answer.ts';
import { lockAt } from '../src/ports/place.ts';
import { valueOf } from '../src/core/lock.ts';

const lock = lockAt(process.cwd());
const owed = { at: 'policy:fixture', by: 'target', form: 'alphabet', measure: 'id', role: 'demands', scope: `${valueOf(lock, 'place/needs')}/bytes/example`, value: 'https://example.invalid/openapi.json' };

for (const failure of ['adoption', 'compilation'] as const) test(`a late document whose ${failure} refuses remains owed and cannot authorize an answer`, async () => {
  const writes: string[][] = []; let policyReads = 0;
  const context = {
    lock: lock.map((line) => line.scope === 'world/adopts' ? { ...line, value: '' } : line),
    standing: async () => ({ lines: [owed] }),
    home: () => '/fixture/home',
    keys: { read: () => 'unused fixture account', held: () => 'fixture-public-key' },
    files: { has: () => false, lay: () => undefined, drop: () => undefined, read: { documentOf: async () => ({ kind: 'json', bytes: new TextEncoder().encode('{}') }) } },
    machine: () => 0,
    policy: async () => ++policyReads === 1 ? { lines: [{ scope: valueOf(lock, 'founding/root'), measure: 'public-key', value: 'fixture-public-key' }] } : failure === 'adoption' ? { refused: 'REFUSE·fixture adoption failed' } : { lines: [] },
    world: async () => ({ refused: 'REFUSE·fixture compilation failed' }),
    landRoot: async (_place: string, lines: string[]) => { writes.push(lines); return { lines }; },
  } as unknown as Context;
  const result = await paidIn({ source: 'example' }, context, '/fixture/place');
  deepStrictEqual(result.answer, false);
  deepStrictEqual(writes.filter((lines) => lines.some((line) => /value=withdraw(?: |$)/.test(line))), []);
  match(result.said.join('\n'), new RegExp(`fixture ${failure} failed`));
});
