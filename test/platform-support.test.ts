import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert/strict';
import { headOf, plainOf } from '../src/doors/head.ts';
import { lock, root } from './place.ts';
import { valueOf, members } from '../src/core/lock.ts';
import { refusedOn, shapeOf } from '../src/ports/surface.ts';

test('the supported desktop platform is macOS; other platform ports do not imply supported operation', () => {
  deepStrictEqual(members(valueOf(lock, 'platform/supported')), ['darwin']);
  deepStrictEqual(refusedOn(lock, 'darwin'), undefined);
  for (const platform of ['linux', 'win32']) ok(refusedOn(lock, platform)?.includes('head/platform'));
});

test('an unsupported environment refuses before key lookup, elicitation, founding or card checks', async () => {
  const unsupported = lock.map(line => line.scope === 'platform/supported' ? { ...line, value: 'unsupported-fixture' } : line);
  const noCalls = () => { throw Error('unsupported platform must not invoke a port'); };
  const head = headOf(unsupported, root, '.ts', { name: 'fixture', roots: async () => noCalls(), client: noCalls, can: noCalls, elicit: async () => noCalls() });
  const expected = shapeOf([refusedOn(unsupported, process.platform)!]).cells;
  deepStrictEqual(shapeOf((await head.call('connect', {}, new AbortController().signal))!).cells, expected);
  const plain = plainOf(unsupported, root, '.ts', 'fixture');
  deepStrictEqual(shapeOf((await plain.asked('do', {}))!).cells, expected);
  await Promise.all([head.idle(), plain.head.idle()]);
});
