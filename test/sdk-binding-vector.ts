import { test } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ask } from './client.ts';

/** Compare public incoming frames with the unchanged implementation; no place or external source is opened. */
test('SDK boundary: the existing incoming catalogue frames and CLI help remain byte-identical', async () => {
  const baseline = process.env['HEAD_BASELINE_ENTRY'];
  if (!baseline) throw Error('SDK parity requires an explicit baseline entry');
  const candidate = new URL('../src/index.ts', import.meta.url).pathname;
  const calls = ['tools/list', 'resources/list', 'resources/templates/list', 'prompts/list'].map(method => ({ method }));
  const before = await ask(calls, [], { HEAD_ENTRY: baseline }) as readonly Record<string, unknown>[] & { initialized: unknown };
  const after = await ask(calls, [], { HEAD_ENTRY: candidate }) as readonly Record<string, unknown>[] & { initialized: unknown };
  equal(JSON.stringify(after.initialized), JSON.stringify(before.initialized));
  const frames = (responses: readonly Record<string, unknown>[]) => responses.map(({ seconds, ...frame }) => JSON.stringify(frame));
  deepStrictEqual(frames(after), frames(before));
  const help = (entry: string) => { const got = spawnSync(process.execPath, [entry], { encoding: 'utf8' }); equal(got.status, 0); return got.stdout; };
  equal(help(candidate), help(baseline));
});
