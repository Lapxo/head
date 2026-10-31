import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert/strict';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { headOf, plainOf } from '../src/doors/head.ts';
import { keyFailureOf } from '../src/ports/keychain.ts';
import { shapeOf } from '../src/ports/surface.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { lock, root } from './place.ts';

test('public key failures retain only their identifier, never raw exception output', () => {
  deepStrictEqual(keyFailureOf(Error('REFUSE·keychain/read-unavailable private diagnostic')), 'keychain/read-unavailable');
  deepStrictEqual(keyFailureOf(Error('private diagnostic')), undefined);
});

test('MCP and plain doors name a failed store without creating keys or retrying to sign the refusal', async () => {
  const fake = fakeKeychain({}), dir = fake.env.PATH.split(':')[0]!, beforePath = process.env.PATH, beforeHome = process.env.HEAD_HOME;
  const calls = join(dir, 'calls');
  writeFileSync(join(dir, 'security'), `#!/bin/sh\nprintf '%s\\n' "$1" >> '${calls}'\nexit 36\n`); chmodSync(join(dir, 'security'), 0o755);
  process.env.PATH = fake.env.PATH; process.env.HEAD_HOME = join(dir, 'new-home');
  try {
    const head = headOf(lock, root, '.ts', { name: 'fixture', roots: async () => [], client: () => undefined, can: () => ({ form: false, url: false }), elicit: async () => { throw Error('must not elicit after failed key lookup'); } });
    const plain = plainOf(lock, root, '.ts', 'fixture');
    for (const lines of [await head.call('ask', {}, new AbortController().signal), await plain.asked('ask', { card: 'true' })]) {
      const cells = shapeOf(lines!).cells;
      deepStrictEqual(cells.map(cell => [cell.code, cell.state, cell.fields.reason]), [['head/key-store-refused', 'refused', 'keychain/read-unavailable']]);
      ok('none' in cells[0]!.next && cells[0]!.next.none.includes('Inspect'));
    }
    deepStrictEqual(fake.argv(), '');
    deepStrictEqual(readFileSync(calls, 'utf8').trim().split('\n'), ['find-generic-password', 'find-generic-password'], 'each door made one read attempt, no create or signing retry');
    await Promise.all([head.idle(), plain.head.idle()]);
  } finally { if (beforePath === undefined) delete process.env.PATH; else process.env.PATH = beforePath; if (beforeHome === undefined) delete process.env.HEAD_HOME; else process.env.HEAD_HOME = beforeHome; }
});
