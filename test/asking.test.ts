import { test } from 'node:test';
import { deepStrictEqual, doesNotMatch, match } from 'node:assert';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browser } from './browser.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { said, text } from './place.ts';

const found = (dir: string) => ({ method: 'tools/call', params: { name: 'place', arguments: { dir } } });
const shared = () => ((at) => ({ dir: join(at, 'shop'), env: { ...fakeKeychain({}).env, HEAD_HOME: join(at, 'home') } }))(mkdtempSync(join(tmpdir(), 'head-asking-')));

test('a client that declares no channel still reaches the person: head-s page opens on this device, the yes is theirs, and the model never sees its address', async () => {
  const { dir, env } = shared(), person = browser({ yes: 'true' });
  const [born] = await ask([found(dir)], [], person.path(env));
  match(text(born), said('born')); deepStrictEqual(person.seen(), ['page yes']);
  doesNotMatch(text(born), /127\.0\.0\.1|localhost/, 'the page-s address is the person-s, never in what the model reads');
});

test('no: a person who answers No on this device-s page said no — nothing is founded', async () => {
  const { dir, env } = shared(), person = browser({ yes: 'false' });
  const [refused] = await ask([found(dir)], [], person.path(env));
  match(text(refused), said('no-yes')); deepStrictEqual([person.seen(), existsSync(join(dir, 'TARGET.bound'))], [['page yes'], false]);
});

test('no: where nothing reaches the person — no form, no address, a browser that does not open — nothing was asked, nothing is founded, and head names what was missing and what would supply it', async () => {
  const { dir, env } = shared(), person = browser({}, false);
  const [refused] = await ask([found(dir)], [], person.path(env));
  match(text(refused), said('cannot-ask')); doesNotMatch(text(refused), said('no-yes'));
  deepStrictEqual([person.seen(), existsSync(join(dir, 'TARGET.bound'))], [[], false]);
});
