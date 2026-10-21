import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { members, valueOf } from '../src/core/lock.ts';
import { run } from './cli.ts';
import { ask } from './client.ts';
import { api, born, line, lock, viewOf } from './place.ts';

const call = (name: 'ask' | 'do', args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
const cells = (answer: any): any[] => answer.result.structuredContent.cells;
const codes = (answer: any): string[] => cells(answer).map((c) => c.code);
const cardOf = (answer: any): string => cells(answer).find((c) => c.code === 'head/card')!.fields.card;
const allow = (scope: string, times: number) => line(scope, 'calls', `0..${times}`, { form: 'interval', at: 'policy:person/allows' });
const create = (place: string, card: string, title: string) => call('do', { action: 'act', card, place, source: 'tracker', operation: 'issues/create', args: { owner: 'lapxo', repo: 'demo', body: { title } } });
const listing = (place: string, more: Record<string, unknown> = {}) => call('ask', { place, source: 'tracker', operation: 'issues/list-for-repo', args: { owner: 'lapxo', repo: 'demo' }, ...more });
const posts = (seen: readonly { method?: string }[]) => seen.filter((one) => one.method === 'POST').length;
const yes = () => ({ action: 'accept', content: { yes: true } });

test('yes: a client is offered three tools; ask reads with no resolution, and a read never moves the card; a do on the card ask answered acts', async () => {
  const server = await api((_url, body) => (body ? '{"number":7}' : '{}'));
  const { place, keychain } = born(server.url, [allow('allow/tracker/issues/create', 1)]);
  const [listed, carded, read, again] = await ask([{ method: 'tools/list' }, call('ask', { place, card: true }), listing(place), call('ask', { place, card: true })], [], keychain.env);
  const [made] = await ask([create(place, cardOf(again), 'one')], [], keychain.env);
  await server.close();
  deepStrictEqual(listed.result.tools.map((t: any) => t.name).sort(), ['ask', 'connect', 'do']);
  ok(['head/answered', 'head/untyped'].some((c) => codes(read).includes(c)) && server.seen.some((one) => one.method === 'GET'), JSON.stringify(codes(read)));
  deepStrictEqual(cardOf(carded), cardOf(again), 'a read lands only its receipts, which no card is made of');
  ok(codes(made).includes('head/untyped') && posts(server.seen) === 1, JSON.stringify(codes(made)));
});

test('no: a do with no card, or with one asked before a lot landed, is refused card-stale, and nothing is called or landed', async () => {
  const server = await api(() => '{"number":7}');
  const { place, keychain } = born(server.url, [allow('allow/tracker/issues/create', 5)]);
  const [carded] = await ask([call('ask', { place, card: true })], [], keychain.env);
  const [planned] = await ask([{ method: 'tools/call', params: { name: 'plan', arguments: { place, lines: allow('allow/tracker/issues/update', 1) } } }], [], keychain.env, yes);
  await ask([{ method: 'tools/call', params: { name: 'land', arguments: { lot: /lot="(sha256:[0-9a-f]+)"/.exec(planned.result.content[0].text)![1] } } }], [], keychain.env);
  const before = viewOf(place, 'lines');
  const [none, stale] = await ask([create(place, '', 'a'), create(place, cardOf(carded), 'b')], [], keychain.env);
  await server.close();
  deepStrictEqual([codes(none), codes(stale)], [['head/card-stale'], ['head/card-stale']]);
  deepStrictEqual(cells(stale)[0].next, { tool: 'ask', args: { card: 'true', place } }, 'the next step is to read the place again');
  deepStrictEqual([posts(server.seen), viewOf(place, 'lines')], [0, before]);
});

test('no: an action the place does not allow is not in the card, said beside head-s own refusal, and nothing is called; an action do does not know is said so', async () => {
  const server = await api(() => '{}');
  const { place, keychain } = born(server.url, [allow('allow/tracker/issues/create', 5), allow('allow/tracker', 0)]);
  const [carded] = await ask([call('ask', { place, card: true })], [], keychain.env);
  const before = viewOf(place, 'lines');
  const [capped, unknown] = await ask([create(place, cardOf(carded), 'a'), call('do', { action: 'nothing', card: cardOf(carded), place })], [], keychain.env);
  await server.close();
  deepStrictEqual(codes(capped), ['head/not-in-card', 'head/not-allowed', 'head/card']);
  deepStrictEqual(cells(capped)[0].fields.why, 'head/not-allowed', 'until bound folds the card, head-s own check is named as the reason');
  deepStrictEqual([posts(server.seen), viewOf(place, 'lines')], [0, before]);
  deepStrictEqual([codes(unknown), cells(unknown)[0].fields.actions], [['head/unknown-action'], members(valueOf(lock, 'do/actions')).join('|')]);
});

test('a place that signs no view of cells answers its card as cells, never a sentence: nothing open, and the card do needs; asked why, the card declares nothing that explains it, so the same cells come back, said so', async () => {
  const { place, keychain } = born(undefined);
  const [carded, explained] = await ask([call('ask', { place, card: true }), call('ask', { place, card: true, why: true })], [], keychain.env);
  deepStrictEqual([codes(carded), carded.result.structuredContent.lines], [['head/no-cells', 'head/card'], []]);
  ok(/^[0-9a-f]{16}$/.test(cardOf(carded)));
  deepStrictEqual([codes(explained), cells(explained)[0].fields.form, cardOf(explained)], [['head/why-undeclared', 'head/no-cells', 'head/card'], 'card', cardOf(carded)]);
});

test('person-words: no cell of ask carries a resolution number or a ledger epoch, a red included; the offers a person reads and the ones why explains are the lock-s resolutions', async () => {
  const slow = createServer((_request, response) => { setTimeout(() => { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{}'); }, 3100); });
  await new Promise<void>((resolve) => slow.listen(0, '127.0.0.1', resolve));
  const { place, keychain } = born(`http://127.0.0.1:${(slow.address() as AddressInfo).port}`);
  const answers = await ask([listing(place), listing(place, { why: true }), call('ask', { place, source: 'tracker' }), call('ask', { place, source: 'tracker', why: true }), call('ask', { place, view: valueOf(lock, 'bound/standing') }), call('ask', {}), call('ask', { place, card: true })], [], keychain.env);
  slow.closeAllConnections(); slow.close();
  const said = answers.flatMap((a) => cells(a).flatMap((c) => [...Object.values(c.fields), ...Object.values('args' in c.next ? c.next.args : {})] as string[]));
  ok(codes(answers[0]).includes('head/red'), `the slow read reads red: ${JSON.stringify(codes(answers[0]))}`);
  deepStrictEqual(said.filter((v) => /@\d/.test(v)), []);
  deepStrictEqual(answers.flatMap(cells).filter((c) => c.code !== 'head/why' && members(valueOf(lock, 'numbers/structural/why')).some((f) => f in c.fields)).map((c) => c.code), [], 'a ledger epoch reaches only why');
  const [person, why] = [answers[2].result.content[0].text, answers[3].result.content[0].text];
  ok(!/\/form /.test(person) && / scope=offers\/tracker\/[^ ]+\/form /.test(why), 'a person reads where each offer is reached and its class; why brings its forms');
});

test('yes: every answer about a place ends with its card, valid from it: a read returns the card it was asked on, a do acts on the card the previous do returned, and a lot landed returns a new one, the old one stale', async () => {
  const server = await api((_url, body) => (body ? '{"number":7}' : '{}'));
  const { place, keychain } = born(server.url, [allow('allow/tracker/issues/create', 3)]);
  const [carded, read] = await ask([call('ask', { place, card: true }), listing(place)], [], keychain.env);
  const [first] = await ask([create(place, cardOf(read), 'one')], [], keychain.env);
  const [second] = await ask([create(place, cardOf(first), 'two')], [], keychain.env);
  const [planned] = await ask([call('ask', { place, lines: allow('allow/tracker/issues/update', 1) })], [], keychain.env, yes);
  const lot = /lot="(sha256:[0-9a-f]+)"/.exec(planned.result.content[0].text)![1]!;
  const [landed] = await ask([call('do', { action: 'land', card: cardOf(planned), place, lot })], [], keychain.env);
  const [stale] = await ask([create(place, cardOf(second), 'three')], [], keychain.env);
  await server.close();
  const last = (answer: any) => cells(answer).at(-1);
  deepStrictEqual([cardOf(read), last(read).fields.from, last(first).fields.from], [cardOf(carded), 'ask', 'do act'], 'the card a read was asked on stands after it');
  ok(codes(first).includes('head/untyped') && codes(second).includes('head/untyped') && posts(server.seen) === 2, JSON.stringify([codes(first), codes(second)]));
  ok(codes(landed).includes('head/landed') && cardOf(landed) !== cardOf(second), 'a lot landed moves the card, and the answer says the new one');
  deepStrictEqual(codes(stale), ['head/card-stale']);
});

test('no, two actors: a card returned to one goes stale when the other changes the place, and the first acting on it is refused, with nothing called or landed', async () => {
  const server = await api(() => '{"number":7}');
  const { place, root, keychain } = born(server.url, [allow('allow/tracker/issues/create', 5)]);
  const [carded] = await ask([call('ask', { place, card: true })], [], keychain.env);
  const [made] = await ask([create(place, cardOf(carded), 'one')], [], keychain.env);
  const lot = join(mkdtempSync(join(tmpdir(), 'head-other-')), 'lot.bound');
  writeFileSync(lot, `${allow('allow/tracker/issues/update', 1)}\n`);
  deepStrictEqual(run('@lapxo/bound', place, ['land', lot, '--key-file', root])?.code, 0, 'the root, another actor, lands a line in the place');
  const before = viewOf(place, 'lines');
  const [stale] = await ask([create(place, cardOf(made), 'two')], [], keychain.env);
  await server.close();
  deepStrictEqual(codes(stale), ['head/card-stale']);
  deepStrictEqual([posts(server.seen), viewOf(place, 'lines')], [1, before]);
});
