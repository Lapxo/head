import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { limits, run, settledView, words } from '../src/ports/bound.ts';

test('bound runs as a process from its installed package, and what it prints comes back line by line', async () => {
  const printed = await run('@lapxo/bound', mkdtempSync(join(tmpdir(), 'head-')), ['fold', '--as', 'help']);
  ok(printed !== undefined);
  deepStrictEqual([printed.code, printed.out[0]?.split(' ')[0], printed.err], [0, 'verbs', []]);
});

test('a package that is not installed is no instrument: nothing runs', async () => {
  deepStrictEqual(await run('@lapxo/not-installed', tmpdir(), ['fold']), undefined);
});

test('no: a wait on bound that runs out is no reading — the view answers its cause, never lines', async () => {
  Object.assign(words, { read: 'fold', view: '--as' });
  limits.wait = 1;
  try {
    const got = await settledView('@lapxo/bound', mkdtempSync(join(tmpdir(), 'head-')), 'help');
    deepStrictEqual(['refused' in got, 'refused' in got && /^waited 1 ms$/.test(got.refused)], [true, true]);
  } finally { limits.wait = 0; }
  ok('lines' in await settledView('@lapxo/bound', mkdtempSync(join(tmpdir(), 'head-')), 'help'));
});
