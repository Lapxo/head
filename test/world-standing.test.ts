import { test } from 'node:test';
import { deepStrictEqual, ok, throws } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical } from '@lapxo/topos/wire';
import { observe, MEASURE, run } from './world-standing.ts';
import { declaredOf, valueOf, type Said } from '../src/core/lock.ts';
import { digestIn } from '../src/core/worlds.ts';
import { adopted } from '../src/adopt/adopt.ts';
import type { Context } from '../src/core/answer.ts';

const lock = declaredOf(readFileSync('TARGET.bound', 'utf8')), digest = digestIn(lock), limit = 1048576;
const fact = (scope: string, measure: string, value: string, more: Record<string, string> = {}): Said => ({ scope, measure, value, at: 'policy:fixture', by: 'target', role: 'writes', form: 'alphabet', ...more });
const fixture = (payloads: Record<string, Uint8Array>) => {
  const pins = Object.entries(payloads).map(([name, bytes]) => fact(`world/${name}/standing`, 'digest', digest(bytes)));
  const policy = [...lock.filter(line => !/^world\//.test(line.scope ?? '')), ...pins, fact('world/adopts', 'id', Object.keys(payloads).join('|'))];
  return { policy, take: (pin: string) => Object.values(payloads).find(bytes => digest(bytes) === pin) };
};
const { foldCeilings } = await import(pathToFileURL(join(dirname(createRequire(import.meta.url).resolve('@lapxo/bound/package.json')), 'dist/fold/ceilings.js')).href);
const judge = (rows: ReturnType<typeof observe>, measure = MEASURE, ownBytes = 167919417) => {
  const at = 'place:fixture', by = 'reader:fixture';
  const observed = [canonical(fact('samples/world-standing/yes/', 'observed', 'fixture', { at, by })), ...rows.map(row => canonical(fact(row.scope, row.measure, `${row.bound.lo}..${row.bound.hi}`, { form: 'interval', at, by })))];
  return foldCeilings({ standing: [canonical(fact('wire/states', 'id', 'unread'))], observed, own: { bytes: ownBytes }, ceilings: [canonical(fact('world/standing-bytes', measure, '0..1048576', { form: 'interval', role: 'reads' }))], epoch: 1 });
};

test('world standing: declared payloads are read by pin, independently of Root byte totals', () => {
  const rows = run('samples/world-standing/yes'), sizes = rows.filter(row => row.measure === MEASURE);
  deepStrictEqual(sizes.map(row => row.bound.hi).sort((a, b) => a - b), [24627]);
  const old = judge(rows, 'bytes'); ok(old.over.some((row: { ceiling: string }) => row.ceiling === 'world/standing-bytes'));
  const corrected = judge(rows); deepStrictEqual(corrected.over, []); deepStrictEqual(corrected.unread, []);
  deepStrictEqual(judge(rows, MEASURE, 500_000_000).over, []);
});
test('world standing: an unselected pin is not consumed or charged', () => {
  const f = fixture({ first: Buffer.from('first'), second: Buffer.from('not consumed') });
  const policy = f.policy.map(line => line.scope === 'world/adopts' ? { ...line, value: 'first' } : line);
  const rows = observe(policy, pin => { const bytes = f.take(pin)!; ok(bytes.toString() !== 'not consumed'); return bytes; });
  deepStrictEqual(rows.filter(row => row.measure === MEASURE).map(row => row.bound.hi), [5]);
});
test('world standing: an explicitly empty selection is zero; a missing selection refuses', () => {
  const f = fixture({ first: Buffer.from('first') });
  const empty = f.policy.map(line => line.scope === 'world/adopts' ? { ...line, value: '' } : line);
  deepStrictEqual(observe(empty, () => { throw Error('unexpected read'); })[0]!.bound.hi, 0);
  throws(() => observe(f.policy.filter(line => line.scope !== 'world/adopts'), f.take), /missing or ambiguous selection/);
});
test('world standing: two separate payloads do not become a sum against one request ceiling', () => {
  const f = fixture({ first: new Uint8Array(700_000), second: new Uint8Array(700_001) });
  const rows = observe(f.policy, f.take), got = judge(rows); deepStrictEqual(got.over, []); deepStrictEqual(got.unread, []);
  deepStrictEqual(rows.filter(row => row.measure === MEASURE).map(row => row.bound.hi), [700_000, 700_001]);
});
test('world standing: exact boundary passes; one extra physical byte is judged over by Bound', () => {
  const exact = fixture({ sample: Buffer.from('é'.repeat(limit / 2)) });
  deepStrictEqual(judge(observe(exact.policy, exact.take)).over, []);
  const over = fixture({ sample: new Uint8Array(limit + 1) });
  const rows = observe(over.policy, over.take); deepStrictEqual(rows[0]!.bound.hi, limit + 1);
  ok(judge(rows).over.some((row: { ceiling: string; got: string }) => row.ceiling === 'world/standing-bytes' && row.got === String(limit + 1)));
});
test('world standing: absence, corruption, duplicate pins and uncovered adoption refuse without a partial reading', () => {
  const f = fixture({ sample: Buffer.from('standing') });
  throws(() => observe(f.policy, () => undefined), /absent or altered/);
  throws(() => observe(f.policy, () => Buffer.from('changed!')), /absent or altered/);
  throws(() => observe([...f.policy, f.policy.find(line => line.scope === 'world/sample/standing')!], f.take), /ambiguous/);
  throws(() => observe(f.policy.map(line => line.scope === 'world/adopts' ? { ...line, value: 'absent' } : line), f.take), /missing or ambiguous pin/);
  throws(() => observe(f.policy.filter(line => !line.scope?.endsWith('/standing')), f.take), /missing or ambiguous/);
});
test('world standing: cached and fetched current pinned bytes adopt identically under the same numeric limit', async () => {
  const execute = async (policy: readonly Said[], cached: boolean) => {
    const laid: { path: string; pin: string }[] = [], requested: number[] = [];
    const take = (pin: string) => readFileSync(join('samples/world-standing/yes/payloads', `${pin.slice(7)}.bound`));
    const context = { lock: policy, policy: async () => ({ lines: [] }), cache: { held: (pin: string) => cached ? take(pin) : undefined, keep: digest },
      files: { lay: (_place: string, path: string, bytes: Uint8Array) => laid.push({ path, pin: digest(bytes) }) },
      adapter: async () => ({ published: async (_url: string, pin: string, most: number) => { requested.push(most); return take(pin); } }) } as unknown as Context;
    const result = await adopted(context, '/fixture', async lines => ({ lines }), (scope, measure, value, more = {}) => canonical(fact(scope, measure, value, more)));
    return { result, laid, requested };
  };
  const corrected = lock.map(line => line.scope === 'world/standing-bytes' ? { ...line, measure: MEASURE } : line);
  deepStrictEqual(valueOf(corrected, 'world/standing-bytes'), valueOf(lock, 'world/standing-bytes'));
  const a = await execute(lock, true), b = await execute(corrected, true), c = await execute(corrected, false);
  deepStrictEqual(a, b); deepStrictEqual(b.result, c.result); deepStrictEqual(b.laid, c.laid);
  deepStrictEqual(b.requested, []); deepStrictEqual(c.requested, [limit]);
});
