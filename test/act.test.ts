import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { parse } from '@lapxo/topos/wire';
import { ask } from './client.ts';
import { api, born, line, said, text } from './place.ts';

const create = (place: string, title: string) => ({ method: 'tools/call', params: { name: 'act', arguments: { place, source: 'tracker', operation: 'issues/create', args: { owner: 'lapxo', repo: 'demo', body: { title } } } } });
const plan = (place: string, lines: readonly string[]) => ({ method: 'tools/call', params: { name: 'plan', arguments: { place, lines: lines.join('\n') } } });
const landing = (lot: string) => ({ method: 'tools/call', params: { name: 'land', arguments: { lot } } });
const allow = (scope: string, times: number) => line(scope, 'calls', `0..${times}`, { form: 'interval', at: 'policy:person/allows' });
const yes = () => ({ action: 'accept', content: { yes: true } });
const lotOf = (answer: any): string => /Lot (sha256:[0-9a-f]+)/.exec(text(answer))![1]!;
const posts = (seen: readonly { method?: string }[]) => seen.filter((one) => one.method === 'POST').length;

test('the sentences are prompts: three carry the one line to sign, three name the tool that founds, connects and reaches', async () => {
  const { place, keychain } = born(undefined);
  const [listed, can, readonly, asked] = await ask([{ method: 'prompts/list' },
    { method: 'prompts/get', params: { name: 'can', arguments: { source: 'tracker', operation: 'issues/create', times: '2' } } },
    { method: 'prompts/get', params: { name: 'readonly', arguments: { source: 'tracker' } } },
    { method: 'prompts/get', params: { name: 'ask', arguments: { source: 'tracker', operation: 'issues/create' } } }], [place], keychain.env);
  deepStrictEqual(listed.result.prompts.map((p: any) => p.name).sort(), ['access', 'ask', 'can', 'connect', 'place', 'readonly']);
  const last = (answer: any) => answer.result.messages[0].content.text.split('\n').at(-1);
  for (const got of [can, readonly, asked]) deepStrictEqual(parse(last(got)).kind, 'fact');
  match(last(can), / scope=allow\/tracker\/issues\/create value=0\.\.2$/); match(last(readonly), / scope=allow\/tracker value=0\.\.0$/); match(last(asked), / scope=ask\/tracker\/issues\/create /);
});

test('plan: without a way to ask, the lines go back for the person to sign; a no signs nothing; a yes signs exactly them, and land lands them while the base stands', async () => {
  const { place, keychain } = born(undefined);
  const lot = [allow('allow/tracker/issues/create', 1)];
  const [unasked] = await ask([plan(place, lot)], [], keychain.env);
  const [declined] = await ask([plan(place, lot)], [], keychain.env, () => ({ action: 'decline' }));
  const [first, second] = await ask([plan(place, lot), plan(place, [allow('allow/tracker/issues/update', 1)])], [], keychain.env, yes);
  const [landedSecond, staleFirst] = await ask([landing(lotOf(second)), landing(lotOf(first))], [], keychain.env);
  match(text(unasked), said('sign-yourself')); ok(text(unasked).includes(lot[0]!));
  match(text(declined), said('no-yes'));
  match(text(first), said('planned')); match(text(landedSecond), said('landed')); match(text(staleFirst), said('base-moved'));
});

test('act: nothing is called before the person says yes or caps it; within a signed cap, the intent lands, the call is made once, the receipt lands; past the cap, nothing', async () => {
  const server = await api(() => '{"number":7}');
  const { place, keychain } = born(server.url);
  const [before] = await ask([create(place, 'one')], [], keychain.env);
  const [planned] = await ask([plan(place, [allow('allow/tracker/issues/create', 1)])], [], keychain.env, yes);
  const [landed, made, past, read] = await ask([landing(lotOf(planned)), create(place, 'one'), create(place, 'two'),
    { method: 'tools/call', params: { name: 'act', arguments: { place, source: 'tracker', operation: 'issues/get', args: { owner: 'lapxo', repo: 'demo', issue_number: '1' } } } }], [], keychain.env);
  await server.close();
  match(text(before), said('cannot-ask')); match(text(landed), said('landed'));
  ok(text(planned).split('\n').some((l) => / by=person .* scope=allow\/tracker\/issues\/create /.test(l)) && !/REFUSE/.test(text(planned)), 'folding the lot as if landed admits what land admits');
  const out = text(made).split('\n');
  match(out[0]!, said('untyped')); ok(!text(made).includes('"number":7'));
  match(out[1]!, / by=head .* scope=act\/tracker\/issues\/create\/[0-9a-f]{16} sig=.* value=present$/);
  match(out[2]!, / by=head .* scope=act\/tracker\/issues\/create\/[0-9a-f]{16}\/done sig=.* value=sha256:/);
  match(text(past), said('not-allowed')); match(text(read), said('is-read'));
  deepStrictEqual([posts(server.seen), server.seen[0]?.body, server.seen[0]?.headers['authorization']], [1, '{"title":"one"}', 'Bearer token-for-tests']);
});

test('act: asked to be asked, a no calls nothing; a read-only cap wins over any allowance; an idempotency key goes only where the source declares one', async () => {
  const server = await api(() => '{}');
  const asking = born(server.url, [allow('allow/tracker/issues/create', 5), line('ask/tracker/issues/create', 'status', 'present', { at: 'policy:person/asks' })]);
  const [refused] = await ask([create(asking.place, 'a')], [], asking.keychain.env, () => ({ action: 'decline' }));
  const [agreed] = await ask([create(asking.place, 'a')], [], asking.keychain.env, yes);
  const capped = born(server.url, [allow('allow/tracker/issues/create', 5), allow('allow/tracker', 0)]);
  const [cap] = await ask([create(capped.place, 'b')], [], capped.keychain.env);
  const keyed = born(server.url, [allow('allow/tracker/issues/create', 5), allow('allow/tracker/issues/lock', 5)]);
  const [withKey, withoutKey] = await ask([create(keyed.place, 'c'), { method: 'tools/call', params: { name: 'act', arguments: { place: keyed.place, source: 'tracker', operation: 'issues/lock', args: { owner: 'lapxo', repo: 'demo', issue_number: '1' } } } }], [], keyed.keychain.env);
  await server.close();
  match(text(refused), said('no-yes')); match(text(cap), said('not-allowed'));
  deepStrictEqual([text(agreed), text(withKey), text(withoutKey)].map((one) => said('untyped').test(one) && one.includes(' 200 ')), [true, true, true]);
  deepStrictEqual(server.seen.map((one) => one.method), ['POST', 'POST', 'PUT']);
  deepStrictEqual(server.seen.map((one) => /^[0-9a-f]{64}$/.test(String(one.headers['idempotency-key']))), [true, true, false]);
});

test('act: a call that never answered leaves its intent open; the same request waits until a look of what it would have changed closes it, and the closing counts as done', async () => {
  const server = await api(() => '[]', (method, count) => method === 'POST' && count === 1);
  const { place, keychain } = born(server.url, [allow('allow/tracker/issues/create', 2)]);
  const listing = (closes: string) => ({ method: 'tools/call', params: { name: 'look', arguments: { place, source: 'tracker', operation: 'issues/list-for-repo', args: { owner: 'lapxo', repo: 'demo' }, closes, at: '8' } } });
  const refusedRead = (closes: string) => ({ method: 'tools/call', params: { name: 'look', arguments: { place, source: 'tracker', operation: 'issues/create', args: { owner: 'lapxo', repo: 'demo' }, closes, at: '8' } } });
  const step = async (call: unknown) => (await ask([call as never], [], keychain.env))[0];
  const failed = await step(create(place, 'lost'));
  const intent = /(act\/tracker\/issues\/create\/[0-9a-f]{16})/.exec(text(failed))?.[1] ?? '';
  const again = await step(create(place, 'lost'));
  const stranger = await step(listing('act/tracker/issues/create/0000000000000000'));
  const notRead = await step(refusedRead(intent));
  const stillOpen = await step(create(place, 'lost'));
  const looked = await step(listing(intent));
  const retried = await step(create(place, 'lost'));
  const past = await step(create(place, 'other'));
  await server.close();
  match(text(failed), said('act-failed')); match(text(again), said('open'));
  match(text(stranger), said('nothing-open')); match(text(notRead), said('not-callable')); match(text(stillOpen), said('open'));
  match(text(looked), said('closed')); match(text(looked), new RegExp(` scope=${intent.replaceAll('/', '\\/')}\\/closed `));
  deepStrictEqual([said('untyped').test(text(retried)), posts(server.seen)], [true, 2]);
  match(text(past), said('not-allowed'));
});
