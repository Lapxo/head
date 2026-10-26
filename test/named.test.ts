import { namedIn } from '../src/use/named.ts';
import type { Context } from '../src/core/answer.ts';
import type { Said } from '../src/core/lock.ts';
import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { valueOf } from '../src/core/lock.ts';
import { ask } from './client.ts';
import { api, born, lock, said, text } from './place.ts';

const issues = JSON.stringify([{ number: 1, title: 'stale', state: 'open' }]);
const tool = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
const asking = (place: string, operation: string) => tool('look', { place, source: 'tracker', operation, args: { owner: 'lapxo', repo: 'demo', issue_number: '1' }, at: '8' });
const birthOf = (place: string): string => { try { return readFileSync(join(place, valueOf(lock, 'founding/birth-file')), 'utf8'); } catch { return ''; } };
/** A person who says yes to what head asks, picks the offer named when head's form lists several, and keeps what the form listed. */
const person = (pick = '', listed: string[][] = [], asked: string[] = []) => (params: any) => {
  asked.push(params.message);
  const offered = params.requestedSchema?.properties?.[valueOf(lock, 'use/family')]?.oneOf;
  if (offered) listed.push(offered.map((o: any) => o.const));
  return { action: 'accept', content: offered ? { [valueOf(lock, 'use/family')]: pick } : { yes: true } };
};

test('yes: an offer asked by words it was never shown is found in head-s own registry, every word in its id or path; read with no question, it is born as a use line in the person-s file, named by those words; a look at the source names it alone, the rest counted, never listed', async () => {
  const server = await api(() => issues), { place, keychain } = born(server.url), asked: string[] = [];
  const [read, looked] = await ask([asking(place, 'list for repo'), tool('look', { place, source: 'tracker', at: '0' })], [], keychain.env, person('', [], asked));
  await server.close();
  deepStrictEqual([asked, server.seen.map((s) => s.url)], [[], ['/repos/lapxo/demo/issues']], 'one read, nothing asked');
  match(birthOf(place), / scope=use\/tracker\/list-for-repo value=issues\/list-for-repo\n/);
  ok(!text(read).includes(` scope=${valueOf(lock, 'use/family')}/`), 'the answer carries its receipt, never the use line');
  ok(text(looked).includes(' scope=use/tracker/list-for-repo ') && text(looked).includes(' scope=offers/tracker/issues/list-for-repo ') && !/ scope=offers\/tracker\/(count|status|issues\/get) /.test(text(looked)), text(looked));
  match(text(looked), said('more-offers'));
});

test('several offers fit the words: the person chooses in head-s form, which lists them to the person alone; the answer names none but the one chosen, and that one is born a use line', async () => {
  const server = await api(() => issues), { place, keychain } = born(server.url), listed: string[][] = [];
  const [read] = await ask([asking(place, 'repo issues')], [], keychain.env, person('issues/list-for-repo', listed));
  await server.close();
  ok(listed.length === 1 && listed[0]!.length > 1 && listed[0]!.includes('issues/list-for-repo'), JSON.stringify(listed));
  ok(listed[0]!.filter((op) => op !== 'issues/list-for-repo').every((op) => !text(read).includes(op)), 'the model is never shown the rest');
  match(birthOf(place), / scope=use\/tracker\/repo-issues value=issues\/list-for-repo\n/);
});

test('no: words no offer holds are said as an operation the source does not offer — nothing is called and no line is born', async () => {
  const server = await api(() => issues), { place, keychain } = born(server.url);
  const [read] = await ask([asking(place, 'weather today')], [], keychain.env, person());
  await server.close();
  match(text(read), said('unknown-operation')); deepStrictEqual(server.seen.length, 0);
  ok(!birthOf(place).includes(' scope=use/'), birthOf(place));
});

test('outside the read grant the person is asked once; on their yes the offer is read, and two lines are born in their file: the grant and the use', async () => {
  const server = await api(() => issues), { place, keychain } = born(server.url, [], 'token-for-tests', true, 'tracker', false), asked: string[] = [];
  await ask([asking(place, 'list for repo')], [], keychain.env, person('', [], asked));
  await server.close();
  deepStrictEqual([asked.length, server.seen.length], [1, 1]);
  ok([' scope=allow/read ', ' scope=use/tracker/list-for-repo '].every((s) => birthOf(place).includes(s)), birthOf(place));
});

 test('a declared name reuse never reads an offer registry it does not need, in two unrelated domains', async () => {
  for (const source of ['weather', 'invoices']) {
    const lines: Said[] = [{ scope: `${valueOf(lock, 'use/family')}/${source}/saved`, value: 'get-status' }, { scope: `unused/${source}`, get measure(): string { throw Error('an unused registry was inspected'); } }];
    deepStrictEqual(await namedIn({ lock } as Context, lines, source, 'saved', false), { operation: 'get-status' });
  }
});
