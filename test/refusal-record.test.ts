import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { valueOf } from '../src/core/lock.ts';
import { run, settledView, words } from '../src/ports/bound.ts';
import { lock } from './place.ts';

test('a refusal says its diagnostic, and the record bound prints after it is read apart — what bound printed is kept whole, the record beside it, never taken as the reason', async () => {
  Object.assign(words, { read: valueOf(lock, 'bound/read'), view: valueOf(lock, 'bound/view'), refusal: valueOf(lock, 'bound/refusal') });
  const empty = mkdtempSync(join(tmpdir(), 'head-refusal-')), view = valueOf(lock, 'bound/standing');
  const got = (await run('@lapxo/bound', empty, [words.read, words.view, view]))!;
  ok(got.code !== 0, 'an empty folder is no place');
  deepStrictEqual([got.refusal?.profile, typeof got.refusal?.code, typeof got.refusal?.next, got.err.at(-1)!.includes(words.refusal)], [words.refusal, 'string', 'string', true]);
  const folded = await settledView('@lapxo/bound', empty, view);
  ok('refused' in folded);
  match(folded.refused, /owner ledger is empty/);
});
