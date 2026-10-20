import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { valueOf } from '../src/core/lock.ts';
import { codes, person } from './connected-person.ts';
import { line, lock } from './place.ts';

for (const [why, change] of [
  ['withdrawn', () => [line(valueOf(lock, 'grant/family'), 'until', '2000-01-01', { at: 'policy:head/first-run' })]],
  ['changed', () => [line(`${valueOf(lock, 'vocab/offers')}/forecast/elsewhere`, 'class', 'listed')]],
  ['expired', () => [line(`${valueOf(lock, 'reuse/family')}/forecast`, 'seconds', '0..0', { form: 'interval' })]],
] as const) test(`no, over two places: a receipt that stands but whose context moved (${why}) is never answered from what was kept — the source is called again and the cell says so; the other place, unmoved, still answers from it`, async () => {
  const [a, b] = [await person(), await person()];
  const [[movedA], [stillB]] = await (async () => { try { await a.asking(); await b.asking(); a.rooted(change()); return [await a.asking(), await b.asking()]; } finally { a.close(); b.close(); } })();
  deepStrictEqual([codes(movedA).filter((c) => c.startsWith('head/kept')), codes(movedA).includes('head/answered'), a.reads()], [[`head/kept-${why}`], true, 2], JSON.stringify(codes(movedA)));
  deepStrictEqual([codes(stillB).includes('head/reused'), b.reads()], [true, 1], JSON.stringify(codes(stillB)));
});
