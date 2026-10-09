import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ask } from './client.ts';
import { canonical, parse } from '@lapxo/topos/wire';
import { api, born, line, lock, root, said, text, viewOf } from './place.ts';

const look = (place: string, operation: string, args: Record<string, string> = {}) => ({ method: 'tools/call', params: { name: 'look', arguments: { place, source: 'tracker', operation, args, at: '8' } } });
const issue = (n: string) => ({ owner: 'o', repo: 'r', issue_number: n });
const answers = (url: string, body = '') => (url === '/login' && body.includes('many') ? '{"selectionToken":"sel-1","shops":[{"id":"s1","name":"One"},{"id":"s2","name":"Two"}]}' : url === '/select-shop' && body.includes('sel-1') ? '{"token":"t-picked"}' : url === '/login' ? '{"token":"t-first"}' : url === '/select-shop' ? '{"token":"t-shop","expiresIn":3600}' : url === '/token' ? '{"access_token":"o-1","expires_in":60}' : '[]');
const kept = (keychain: { held: (account: string) => string }, place: string, source = 'tracker') => ((sealed) => (sealed ? JSON.parse(Buffer.from(sealed, 'base64url').toString('utf8')) : undefined))(keychain.held(`place/${basename(place)}/api/${source}`));
const journal = (place: string) => viewOf(place, 'evidence');
/** The place's root allowing a flow to ask the person this many secrets on head's page. */
const secrets = (n: number) => line('access/secret-inputs', 'count', `0..${n}`, { form: 'interval' });

/** A person at the client: head's own page is opened and filled with what they enter; a provider's page sends them back with a code; a form is answered, field by field, with what they choose. */
const person = (entered: Record<string, string>, chosen: Record<string, string> = {}, seen: string[] = []) => async (params: any) => {
  if (params.mode !== 'url' && params.requestedSchema?.properties?.yes) { seen.push('yes'); return { action: 'accept', content: { yes: true } }; }
  if (params.mode !== 'url') { const asked = Object.keys(params.requestedSchema?.properties ?? {}); seen.push(`form ${asked.join(',')}`); return { action: 'accept', content: Object.fromEntries(asked.filter((k) => k in chosen).map((k) => [k, chosen[k]])) }; }
  const at = new URL(params.url);
  if (at.searchParams.has('redirect_uri')) {
    seen.push(`provider ${[...at.searchParams.keys()].sort().join(',')}`);
    await fetch(`${at.searchParams.get('redirect_uri')}?code=c-1&state=${at.searchParams.get('state')}`);
  } else {
    seen.push(`page ${(await (await fetch(params.url)).text()).match(/type="(\w+)"/g)?.join(',')}`);
    await fetch(params.url, { method: 'POST', body: new URLSearchParams(entered) });
  }
  return { action: 'accept' };
};

test('a bearer the source declares and does not say how to obtain is a secret input: entered once on head-s page because the place-s root allows it, kept marked as entered by hand, never passing through the model', async () => {
  const server = await api(answers);
  const { place, keychain } = born(server.url, [secrets(1)], null);
  const seen: string[] = [];
  const [first, second] = await ask([look(place, 'issues/get', issue('1')), look(place, 'status')], [], keychain.env, person({ token: 'secret-from-page' }, {}, seen));
  const [again] = await ask([look(place, 'issues/get', issue('2'))], [], keychain.env, person({ token: 'never-asked' }, {}, seen));
  await server.close();
  match(text(first), said('untyped'));
  deepStrictEqual(seen, ['page type="password"']);
  deepStrictEqual([kept(keychain, place)?.secret, kept(keychain, place)?.manual], ['secret-from-page', true]);
  ok([first, second, again].every((one) => !text(one).includes('secret-from-page')) && !keychain.argv().includes('secret-from-page') && !journal(place).includes('secret-from-page'));
  match(journal(place), / scope=access\/tracker\/token\/entered /);
  deepStrictEqual(server.seen.map((one) => [one.url, one.headers['authorization'] ?? '']), [['/repos/o/r/issues/1', 'Bearer secret-from-page'], ['/status', ''], ['/repos/o/r/issues/2', 'Bearer secret-from-page']]);
});

test('no: a secret the place-s root does not allow is never asked — refused naming the input — and an allowed one a client cannot offer on a device with no browser leaves nothing kept and nothing called', async () => {
  const server = await api(answers);
  const [denied, allowed] = [born(server.url, [], null), born(server.url, [secrets(1)], null)];
  let prompts = 0;
  const [refused] = await ask([look(denied.place, 'issues/get', issue('1'))], [], denied.keychain.env, () => { prompts += 1; return { action: 'decline' }; });
  const [unasked] = await ask([look(allowed.place, 'issues/get', issue('1'))], [], allowed.keychain.env);
  await server.close();
  match(text(refused), said('secret-unallowed')); match(text(refused), / for token, a secret/); match(text(unasked), said('entry-unfinished'));
  match(allowed.keychain.opened(), /^http:\/\/127\.0\.0\.1:\d+\/[\w-]+\n$/);
  deepStrictEqual([prompts, kept(denied.keychain, denied.place), kept(allowed.keychain, allowed.place), server.seen.length], [0, undefined, undefined, 0]);
});

test('a declared flow: each input asked as it says — a form, a secret on head-s page — sent once, its next step sent with the first token, and only the token it ends in is kept', async () => {
  const server = await api(answers);
  const { place, keychain } = born(server.url, [line('allow/origin/accounts', 'id', server.url), secrets(1)], null);
  const seen: string[] = [];
  const [mine] = await ask([look(place, 'issues/mine')], [], keychain.env, person({ password: 'pw-never-kept' }, { email: 'ana@example.test', shopId: 's-1' }, seen));
  await server.close();
  ok(!said('entry-unfinished').test(text(mine)), text(mine));
  deepStrictEqual(seen, ['form email', 'page type="password"', 'form shopId']);
  deepStrictEqual(server.seen.map((one) => [one.method, one.url, one.headers['authorization'] ?? '']), [['POST', '/login', ''], ['POST', '/select-shop', 'Bearer t-first'], ['GET', '/mine', 'Bearer t-shop']]);
  deepStrictEqual([JSON.parse(server.seen[0]!.body), JSON.parse(server.seen[1]!.body)], [{ email: 'ana@example.test', password: 'pw-never-kept' }, { shopId: 's-1' }]);
  deepStrictEqual(kept(keychain, place)?.secret, 't-shop'); ok(kept(keychain, place)?.expires > Date.now());
  ok(!text(mine).includes('pw-never-kept') && !keychain.argv().includes('pw-never-kept') && !JSON.stringify(kept(keychain, place)).includes('pw-never-kept'));
});

test('a flow whose first answer calls for a next step: the step runs because its when holds, carries forward what the answer named, the person chooses among what it listed, and the token the step answers is kept', async () => {
  const server = await api(answers);
  const { place, keychain } = born(server.url, [line('allow/origin/accounts', 'id', server.url), secrets(1)], null);
  const offered: unknown[] = [];
  const [picked] = await ask([look(place, 'issues/picked')], [], keychain.env, async (params: any) => {
    if (params.mode === 'url') { await fetch(params.url, { method: 'POST', body: new URLSearchParams({ password: 'pw' }) }); return { action: 'accept' }; }
    if (params.requestedSchema.properties.email) return { action: 'accept', content: { email: 'many@example.test' } };
    offered.push(params.requestedSchema.properties.shopId.oneOf); return { action: 'accept', content: { shopId: 's2' } };
  });
  await server.close();
  ok(!said('login-refused').test(text(picked)) && !said('entry-unfinished').test(text(picked)), text(picked));
  deepStrictEqual(offered, [[{ const: 's1', title: 'One' }, { const: 's2', title: 'Two' }]]);
  deepStrictEqual(server.seen.map((one) => [one.url, one.headers['authorization'] ?? '', one.url === '/select-shop' ? JSON.parse(one.body) : '']), [['/login', '', ''], ['/select-shop', '', { selectionToken: 'sel-1', shopId: 's2' }], ['/picked', 'Bearer t-picked', '']]);
  deepStrictEqual(kept(keychain, place)?.secret, 't-picked');
});

test('OAuth 2 with a code: the person is sent to the provider with the scopes reads need, comes back once with the state head chose, and the code is exchanged with its PKCE verifier; no client registered, no visit; another state, no exchange', async () => {
  const server = await api(answers);
  const declared = [line('keys/access/tracker/oauth/steps/2', 'url', `${server.url}/token`)];
  const { place, keychain } = born(server.url, [...declared, line('keys/access/tracker/oauth', 'client', 'client-1')], null);
  const seen: string[] = [];
  const [assigned] = await ask([look(place, 'issues/assigned')], [], keychain.env, person({}, {}, seen));
  const clientless = born(server.url, declared, null);
  const [refused] = await ask([look(clientless.place, 'issues/assigned')], [], clientless.keychain.env, person({}, {}, seen));
  const forged = born(server.url, [...declared, line('keys/access/tracker/oauth', 'client', 'client-1')], null);
  const [mismatched] = await ask([look(forged.place, 'issues/assigned')], [], forged.keychain.env, async (params: any) => { await fetch(`${new URL(params.url).searchParams.get('redirect_uri')}?code=c-2&state=not-the-one`); return { action: 'accept' }; });
  await server.close();
  ok(!said('login-refused').test(text(assigned)), text(assigned)); match(text(refused), said('no-client')); match(text(mismatched), said('login-refused'));
  deepStrictEqual(server.seen.filter((one) => one.url === '/token').length, 1);
  deepStrictEqual(seen, ['provider client_id,code_challenge,code_challenge_method,redirect_uri,response_type,scope,state']);
  const exchanged = new URLSearchParams(server.seen.find((one) => one.url === '/token')!.body);
  deepStrictEqual([exchanged.get('grant_type'), exchanged.get('code'), exchanged.get('client_id')], ['authorization_code', 'c-1', 'client-1']);
  deepStrictEqual(server.seen.filter((one) => one.url === '/assigned').map((one) => one.headers['authorization']), ['Bearer o-1']);
  deepStrictEqual(createHash('sha256').update(exchanged.get('code_verifier')!).digest('base64url').length, 43);
});

test('an API key rides the query member the source names, and a user and password the Authorization header, each entered once', async () => {
  const server = await api(answers);
  const keyed = born(server.url, [secrets(1)], null);
  const [count] = await ask([look(keyed.place, 'count')], [], keyed.keychain.env, person({ key: 'k-1' }));
  const passed = born(server.url, [secrets(1)], null);
  const [sum] = await ask([look(passed.place, 'sum')], [], passed.keychain.env, person({ password: 'p-1' }, { user: 'ana' }));
  await server.close();
  ok(![count, sum].some((one) => /k-1|p-1/.test(text(one))));
  deepStrictEqual(server.seen.map((one) => [one.url, one.headers['authorization'] ?? '']), [['/count?api_key=k-1', ''], ['/sum', `Basic ${Buffer.from('ana:p-1').toString('base64')}`]]);
});

test('access ahead of any call: a server that names where a client registers (RFC 7591) gets one registered for this visit at head-s return address, the code is exchanged with PKCE, the token kept in the keychain and its receipt landed; nothing of the server is called', async () => {
  const provider = await api((url) => (url === '/register' ? '{"client_id":"registered-1"}' : url === '/token' ? '{"access_token":"tok-1","expires_in":3600}' : '{}'));
  const refusing = await api((url) => (url === '/register' ? '{"error":"invalid_client_metadata"}' : '{"access_token":"never"}'));
  const placeOf = (at: string, input = 'client-name') => born(at, (JSON.parse(readFileSync(join(root, 'vectors/mcp-demo.json'), 'utf8')) as { lines: string[] }).lines
    .map((l) => ((got) => (got.kind === 'fact' ? canonical({ ...got.value.fields, by: 'target', at: 'policy:fixture' }) : l))(parse(l.replaceAll('https://auth.notes.example', at).replaceAll('https://notes.example', at).replace('$host.client-name', `$host.${input}`)))), null, false, 'demo');
  const [one, two, asking] = [placeOf(provider.url), placeOf(refusing.url), placeOf(provider.url, 'client-uri')];
  const seen: string[] = [];
  const access = (place: string) => ({ method: 'tools/call', params: { name: 'access', arguments: { place, source: 'demo' } } });
  const [kept1] = await ask([access(one.place)], [], one.keychain.env, person({}, {}, seen));
  const [refused] = await ask([access(two.place)], [], two.keychain.env, person({}, {}, seen));
  const [undeclared] = await ask([access(asking.place)], [], asking.keychain.env, person({}, {}, []));
  await provider.close(); await refusing.close();
  match(text(undeclared), said('host-input')); match(text(undeclared), /client-uri/);
  match(text(kept1), said('access-kept')); match(text(refused), said('step-unanswered')); match(text(refused), /at register/);
  deepStrictEqual([provider.seen.map((r) => r.url), refusing.seen.map((r) => r.url)], [['/register', '/token'], ['/register']]);
  const registration = JSON.parse(provider.seen[0]!.body) as Record<string, unknown>;
  deepStrictEqual([registration['token_endpoint_auth_method'], registration['grant_types'], (registration['redirect_uris'] as string[]).every((u) => u.startsWith('http://127.0.0.1:'))], ['none', ['authorization_code'], true]);
  deepStrictEqual(registration['client_name'], lock.find((l) => l.scope === 'host/client-name')?.value, 'the client is named as the host names itself, never by the world');
  deepStrictEqual((JSON.parse(readFileSync(join(root, 'vectors/mcp-demo.json'), 'utf8')) as { lines: string[] }).lines.filter((l) => / scope=\S+\/payload\/client_name /.test(l)).map((l) => / value=(\S+)/.exec(l)?.[1]), ['$host.client-name'], 'the world compiles a flow that asks its host, and names none');
  const exchanged = new URLSearchParams(provider.seen[1]!.body);
  deepStrictEqual([exchanged.get('client_id'), exchanged.get('grant_type'), Boolean(exchanged.get('code_verifier'))], ['registered-1', 'authorization_code', true]);
  deepStrictEqual(seen, ['provider client_id,code_challenge,code_challenge_method,redirect_uri,resource,response_type,scope,state']);
  deepStrictEqual(kept(one.keychain, one.place, 'demo')?.secret, 'tok-1');
  match(journal(one.place), / by=head .*scope=access\/demo\/authorization\/obtained /);
});

test('a step of another source is reached at the origin of the source access is for, where that source declares it among its own — no pick needed — and refused by name where it does not', async () => {
  const server = await api(answers);
  const declared = born(server.url, [line('region/accounts', 'origins', `${server.url}|https://elsewhere.example`), secrets(1)], null);
  const undeclared = born(server.url, [line('region/accounts', 'origins', 'https://elsewhere.example|https://other.example'), secrets(1)], null);
  const form = async (params: any) => (params.mode === 'url' ? (await fetch(params.url, { method: 'POST', body: new URLSearchParams({ password: 'pw' }) }), { action: 'accept' })
    : { action: 'accept', content: params.requestedSchema.properties.email ? { email: 'one@example.test' } : {} });
  const [reached] = await ask([look(declared.place, 'issues/picked')], [], declared.keychain.env, form);
  const before = server.seen.length;
  const [refused] = await ask([look(undeclared.place, 'issues/picked')], [], undeclared.keychain.env, form);
  await server.close();
  match(text(reached), said('untyped')); deepStrictEqual(server.seen.slice(0, before).map((one) => one.url), ['/login', '/picked']);
  match(text(refused), said('cross-origin')); deepStrictEqual(server.seen.length, before);
});

test('a step whose answer is an error that still carries what its outputs name goes on — a 409 with a selection leads to the choice — and an error that names nothing stops the flow by the step', async () => {
  const conflict = await api((url, body) => (url === '/login' ? [409, '{"success":false,"selectionToken":"sel-1","shops":[{"id":"s1","name":"One"},{"id":"s2","name":"Two"}]}'] as const : url === '/select-shop' && body.includes('sel-1') ? '{"token":"t-picked"}' : '[]'));
  const denied = await api((url) => (url === '/login' ? [401, '{"success":false,"message":"Invalid or expired code"}'] as const : '[]'));
  const run = (at: string) => born(at, [line('allow/origin/accounts', 'id', at), secrets(1)], null);
  const [one, two] = [run(conflict.url), run(denied.url)];
  const person = async (params: any) => (params.mode === 'url' ? (await fetch(params.url, { method: 'POST', body: new URLSearchParams({ password: 'pw' }) }), { action: 'accept' })
    : { action: 'accept', content: params.requestedSchema.properties.email ? { email: 'many@example.test' } : { shopId: 's2' } });
  const [picked] = await ask([look(one.place, 'issues/picked')], [], one.keychain.env, person);
  const [stopped] = await ask([look(two.place, 'issues/picked')], [], two.keychain.env, person);
  await conflict.close(); await denied.close();
  match(text(picked), said('untyped')); deepStrictEqual(conflict.seen.map((r) => r.url), ['/login', '/select-shop', '/picked']); deepStrictEqual(kept(one.keychain, one.place)?.secret, 't-picked');
  match(text(stopped), said('step-unanswered')); match(text(stopped), /at login/); deepStrictEqual(denied.seen.map((r) => r.url), ['/login']);
});
