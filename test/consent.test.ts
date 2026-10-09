import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registryFor } from '../src/ports/signers.ts';
import { run } from './cli.ts';
import { ask } from './client.ts';
import { api, born, line, said, text, viewOf } from './place.ts';

const look = (place: string, operation: string, args: Record<string, string> = {}) => ({ method: 'tools/call', params: { name: 'look', arguments: { place, source: 'tracker', operation, args, at: '8' } } });
const issue = (n: string) => ({ owner: 'o', repo: 'r', issue_number: n });
const ledgers = (place: string) => viewOf(place, 'evidence');
/** A person who says yes to whatever is asked, picks what is offered last, and counts every question. */
const counting = (asked: string[]) => (params: any) => {
  const properties = params.requestedSchema?.properties ?? {};
  asked.push(properties.yes ? `yes: ${params.message.split(':')[0]}` : `choose ${Object.keys(properties).join(',')}`);
  return { action: 'accept', content: properties.yes ? { yes: true } : Object.fromEntries(Object.entries(properties).map(([k, p]: [string, any]) => [k, p.oneOf?.at(-1)?.const ?? ''])) };
};

test('the first read of a place asks once for one sentence — its sources and a period — which the person signs; no read after it asks anything', async () => {
  const server = await api(() => '[]');
  const { place, keychain } = born(server.url, [], 'token-for-tests', true, 'tracker', false);
  const asked: string[] = [];
  const [first, second, third] = await ask([look(place, 'issues/get', issue('1')), look(place, 'issues/get', issue('2')), look(place, 'status')], [], keychain.env, counting(asked));
  await server.close();
  ok([first, second, third].every((one) => said('untyped').test(text(one))), text(first));
  deepStrictEqual(asked.length, 1); match(asked[0]!, /^yes: head may read accounts, tracker in /);
  match(ledgers(place), / by=person .* measure=sources .*scope=allow\/read .*value=accounts\|tracker/); match(ledgers(place), / by=person .* measure=until .*scope=allow\/read /);
  deepStrictEqual(server.seen.length, 3);
});

test('ten reads across three places ask nothing; one write asks once, and the yes is signed for that request alone', async () => {
  const server = await api(() => '{}');
  const places = [born(server.url), born(server.url), born(server.url)];
  const asked: string[] = [];
  const reads = await Promise.all(places.map((p, i) => ask(Array.from({ length: i === 0 ? 4 : 3 }, (_, n) => look(p.place, 'issues/get', issue(String(n + 1)))), [], p.keychain.env, counting(asked))));
  deepStrictEqual([reads.flat().length, asked.length], [10, 0]);
  const [written] = await ask([{ method: 'tools/call', params: { name: 'act', arguments: { place: places[0]!.place, source: 'tracker', operation: 'issues/create', args: { owner: 'o', repo: 'r', body: { title: 't' } } } } }], [], places[0]!.keychain.env, counting(asked));
  await server.close();
  deepStrictEqual(asked.length, 1); match(asked[0]!, /^yes: head asks before it calls issues\/create on tracker/);
  ok(said('untyped').test(text(written)), text(written));
  match(ledgers(places[0]!.place), / by=person .*scope=allow\/tracker\/issues\/create\/[0-9a-f]{16} .*value=present/);
  deepStrictEqual(server.seen.filter((one) => one.method === 'POST').length, 1);
});

test('a source declaring several origins has one picked, once, by the person, among them alone; none is a default and the next read asks nothing', async () => {
  const [one, two] = [await api(() => '[]'), await api(() => '[]')];
  const { place, keychain } = born(undefined, [line('region/tracker', 'origins', `${one.url}|${two.url}`)]);
  const asked: string[] = [];
  const [first, second] = await ask([look(place, 'issues/get', issue('1')), look(place, 'issues/get', issue('2'))], [], keychain.env, counting(asked));
  await one.close(); await two.close();
  deepStrictEqual(asked, ['choose origin']);
  ok([first, second].every((r) => said('untyped').test(text(r))), text(first));
  deepStrictEqual([one.seen.length + two.seen.length, new RegExp(` by=person .*scope=allow/origin/tracker .*value=${[one.url, two.url].sort().at(-1)}`).test(ledgers(place))], [2, true]);
});

test('no: head reads the person-s own attestation only while it is the one line of its scope — a second is refused before it is signed, and one landed from elsewhere leaves the place unread, refused by name, nothing called', async () => {
  const server = await api(() => '[]');
  try {
    const { place, keychain } = born(server.url, [], 'token-for-tests', true, 'tracker', false);
    const [first] = await ask([look(place, 'issues/get', issue('1'))], [], keychain.env, counting([]));
    ok(said('untyped').test(text(first)), text(first));
    const renewed = line('allow/read', 'until', '2999-12-31');
    const [planned] = await ask([{ method: 'tools/call', params: { name: 'plan', arguments: { place, lines: renewed } } }], [], keychain.env, counting([]));
    match(text(planned), said('attested-again')); ok(!/Lot sha256:/.test(text(planned)), text(planned));
    const lot = join(mkdtempSync(join(tmpdir(), 'head-attested-')), 'lot.bound');
    writeFileSync(lot, `${renewed}\n`);
    deepStrictEqual(run('@lapxo/bound', place, ['land', lot, '--key', 'person', '--signer', 'keychain'], { ...keychain.env, BOUND_SIGNERS: registryFor('keychain', '@lapxo/head', 'person', 'person', 'ed25519:era1') })?.code, 0);
    deepStrictEqual(viewOf(place, 'evidence').split('\n').filter((l) => / by=person .*measure=until .*scope=allow\/read /.test(l)).length, 2);
    const [after] = await ask([look(place, 'issues/get', issue('2'))], [], keychain.env, counting([]));
    match(text(after), said('unsettled')); match(text(after), /REFUSE·standing person attests allow\/read until/);
    deepStrictEqual(server.seen.length, 1);
  } finally { await server.close(); }
});
