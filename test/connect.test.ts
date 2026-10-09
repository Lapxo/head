import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { api, said, text } from './place.ts';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const yes = (params: any) => (params.requestedSchema?.properties?.yes ? { action: 'accept', content: { yes: true } } : { action: 'accept', content: {} });
const spec = (server: string, extra: Record<string, unknown> = {}) => JSON.stringify({ openapi: '3.0.3', info: { title: 'things', version: '1' }, servers: [{ url: server }],
  paths: { '/things': { get: { operationId: 'listThings', security: [], responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' } } } } } } } } }, post: { operationId: 'addThing', security: [], responses: { 201: { description: 'made' } } } }, ...extra } });
const lock = (dir: string) => readFileSync(join(dir, 'TARGET.bound'), 'utf8');

test('a place is founded where the person names, once they say yes: its root kept in the keychain under its name, its readers bounded, and its name in head-s index', async () => {
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-shared-'))];
  const keychain = fakeKeychain({});
  const env = { ...keychain.env, HEAD_HOME: home };
  const dir = join(shared, 'demo');
  const [born] = await ask([tool('place', { dir })], [], env, yes);
  const [again] = await ask([tool('place', { dir })], [], env, yes);
  const [unasked] = await ask([tool('place', { dir: join(shared, 'other') })], [], env);
  match(text(born), said('born')); match(text(again), said('place-exists')); match(text(unasked), said('cannot-ask'));
  ok(keychain.held('place/demo/root').length > 0 && !lock(dir).includes(keychain.held('place/demo/root')));
  for (const want of [/ measure=signer .*scope=keys\/root .*value=keychain/, / scope=wire\/reader-lifetime .*value=bounded-process@1/, / measure=milliseconds .*scope=reader\/timeout /]) match(lock(dir), want);
  ok(!/ scope=(region|uses)\//.test(lock(dir)), 'a place is born knowing no world: what reads what is said when one is adopted');
  const [index] = await ask([tool('look', { place: home })], [], env);
  ok(text(index).split('\n').some((one) => one.includes(' by=root ') && one.includes(' scope=places/demo ') && one.endsWith(` value=${dir}`)), text(index));
});

test('a source is connected once: its document compiled by the world head carries into a standing pinned from the place-s store; reads stand on the pin, a pin that moved refuses, and a new document is a new pin', async () => {
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-shared-'))];
  const server = await api(() => '[{"id":1}]');
  const keychain = fakeKeychain({});
  const env = { ...keychain.env, HEAD_HOME: home };
  const dir = join(shared, 'shop');
  try {
    await ask([tool('place', { dir })], [], env, yes);
    writeFileSync(join(shared, 'things.json'), spec(server.url));
    writeFileSync(join(tmpdir(), 'head-outside.json'), spec(server.url));
    const [outside, plain] = await ask([tool('connect', { place: dir, source: 'things', document: join(tmpdir(), 'head-outside.json') }), tool('connect', { place: dir, source: 'things', document: `${server.url}/things.json` })], [], env, yes);
    const [connected] = await ask([tool('connect', { place: dir, source: 'things', document: join(shared, 'things.json') })], [shared], env, yes);
    const pin = /Pinned as (sha256:[0-9a-f]+)/.exec(text(connected))?.[1];
    match(text(outside), said('document-unread')); match(text(plain), said('document-unread')); deepStrictEqual(server.seen.length, 0); match(text(connected), said('connected')); ok(pin, text(connected));
    match(text(connected), /2 offers, 1 of them read/);
    match(lock(dir), / scope=uses\/things /); match(lock(dir), / scope=uses\/topos-openapi /);
    for (const reader of [/ measure=coordinates .*scope=region\/spec .*value=connected\/\*/, / measure=receipts .*scope=region\/spec .*value=openapi\/\*\*\|overlaid\/\*\*/, / measure=coordinates .*scope=region\/response .*value=\.answers\/\*\*/]) match(lock(dir), reader);
    const stood = lock(dir);
    ok(!existsSync(join(dir, '.head', 'worlds')) && / scope=sources\/topos-openapi-blob .*value=https:\/\/github\.com\/Lapxo\/topos-openapi\/releases\/download\/v0\.1\.0\//.test(stood), 'the world is pinned where its release publishes it, and none of its bytes is laid in the place');
    ok(!/ scope=(uses|dep|sources)\/topos-mcp/.test(stood), 'topos-mcp is pinned in head, never adopted, until bound composes readings');
    const [again] = await ask([tool('connect', { place: dir, source: 'things', document: join(shared, 'things.json') })], [shared], env, yes);
    ok(text(again).includes(`Pinned as ${pin}.`), text(again)); deepStrictEqual(lock(dir), stood);
    const look = (operation: string, at: string) => tool('look', { place: dir, source: 'things', operation, at });
    const [offered, read] = await ask([look('listThings', '1'), look('listThings', '8')], [], env, yes);
    ok(text(offered).includes('scope=offers/things/listThings ') && !text(offered).includes('/carry '), text(offered));
    match(text(read), said('answered')); deepStrictEqual(server.seen.map((one) => [one.method, one.url]), [['GET', '/things']]);
    const compiled = join(dir, /needs=(\S+) role=writes scope=uses\/things /.exec(lock(dir))![1]!);
    const held = readFileSync(compiled, 'utf8');
    writeFileSync(compiled, held.replace('value=read', 'value=write'));
    const [moved] = await ask([look('addThing', '8')], [], env, yes);
    match(text(moved), said('compiled-moved')); deepStrictEqual(server.seen.length, 1);
    writeFileSync(compiled, held);
    writeFileSync(join(shared, 'things.json'), spec(server.url, { '/more': { get: { operationId: 'listMore', security: [], responses: { 200: { description: 'ok' } } } } }));
    const [reconnected] = await ask([tool('connect', { place: dir, source: 'things', document: join(shared, 'things.json') })], [shared], env, yes);
    const repin = /Pinned as (sha256:[0-9a-f]+)/.exec(text(reconnected))?.[1];
    ok(repin && repin !== pin, text(reconnected)); match(text(reconnected), /3 offers, 2 of them read/);
    const [more] = await ask([tool('look', { place: dir, source: 'things', operation: 'listMore', at: '1' })], [], env, yes);
    ok(text(more).includes('scope=offers/things/listMore '), text(more));
    writeFileSync(join(shared, 'sheet.csv'), 'id,name\n1,one\n');
    const [open] = await ask([tool('connect', { place: dir, source: 'sheet', document: join(shared, 'sheet.csv') })], [shared], env, yes);
    match(text(open), said('no-world')); match(text(open), /^open: no world reads csv\./); match(text(open), / measure=id role=demands scope=needs\/csv value=place@1$/m);
    ok(!existsSync(join(dir, 'connected', 'sheet.csv')) && !/ scope=uses\/sheet /.test(lock(dir)), 'what no world reads is taken back, and nothing is pinned');
    writeFileSync(join(shared, 'broken.yaml'), 'openapi: 3.0.3\ninfo:\n  title: broken\n  title: twice\n  version: "1"\npaths: {}\n');
    const [unparsed] = await ask([tool('connect', { place: dir, source: 'broken', document: join(shared, 'broken.yaml') })], [shared], env, yes);
    match(text(unparsed), said('document-unparsed')); match(text(unparsed), /^broken is a document the world could not parse: Map keys must be unique at line 4/);
    ok(!/no world reads/.test(text(unparsed)) && !existsSync(join(dir, 'connected', 'broken.yaml')) && !/ scope=uses\/broken /.test(lock(dir)), 'a document the world cannot parse is named with why, never sent looking for a world');
    writeFileSync(join(shared, 'legacy.json'), '{"swagger":"2.0","info":{"title":"legacy","version":"1"},"paths":{}}');
    writeFileSync(join(shared, 'calendar.yaml'), 'openapi: 3.2.0\ninfo: { title: calendar, version: "1" }\npaths: {}\n');
    const [legacy, calendar] = await ask([tool('connect', { place: dir, source: 'legacy', document: join(shared, 'legacy.json') }), tool('connect', { place: dir, source: 'calendar', document: join(shared, 'calendar.yaml') })], [shared], env, yes);
    match(text(legacy), said('document-unsupported')); match(text(legacy), /swagger 2\.0/); match(text(calendar), said('document-unsupported')); match(text(calendar), /openapi 3\.2\.0/);
    ok(!/ scope=uses\/(legacy|calendar) /.test(lock(dir)) && !existsSync(join(dir, 'connected', 'legacy.json')), 'a profile the world does not read is named, taken back, and nothing is pinned');
    const pinned = / scope=uses\/things .*value=(sha256:[0-9a-f]+)/.exec(lock(dir))?.[1];
    writeFileSync(join(shared, 'things.yaml'), `openapi: 3.0.3\ninfo: { title: things, version: "2" }\nservers: [{ url: '${server.url}' }]\npaths: {}\n`);
    const [collided] = await ask([tool('connect', { place: dir, source: 'things', document: join(shared, 'things.yaml') })], [shared], env, yes);
    match(text(collided), said('document-collision'));
    deepStrictEqual([/ scope=uses\/things .*value=(sha256:[0-9a-f]+)/.exec(lock(dir))?.[1], existsSync(join(dir, 'connected', 'things.yaml'))], [pinned, false], 'two documents under one name read as neither: the new one is taken back and the pin stands');
  } finally { await server.close(); }
});

test('each step starts in the person-s words: the place, connect and access prompts fill what they are given and name the tool that does it', async () => {
  const prompt = (name: string, args: Record<string, string>) => ({ method: 'prompts/get', params: { name, arguments: args } });
  const [place, connect, access] = await ask([prompt('place', { dir: '/srv/shop', name: 'shop' }), prompt('connect', { place: '/srv/shop', source: 'things', document: '/srv/things.json' }), prompt('access', { place: '/srv/shop', source: 'things' })]);
  const words = (answer: any): string => answer.result.messages.map((m: any) => m.content.text).join('\n');
  match(words(place), /^Found the place shop in \/srv\/shop with the place tool\./); match(words(connect), /^Connect things to the place \/srv\/shop from \/srv\/things\.json with the connect tool/);
  match(words(access), /^Prove access to things in \/srv\/shop with the access tool\. .*never here\.$/);
});

test('a document that names its operations by method and path, and its servers on the path, connects and reads: each operation keyed as one step, every server it declares an origin', async () => {
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-unnamed-'))];
  const server = await api(() => '{"latitude":52.5,"timezone":"GMT"}');
  const env = { ...fakeKeychain({}).env, HEAD_HOME: home };
  const dir = join(shared, 'forecast');
  try {
    writeFileSync(join(shared, 'weather.json'), JSON.stringify({ openapi: '3.1.0', info: { title: 'weather', version: '1' }, paths: { '/v1/forecast': { servers: [{ url: server.url }],
      get: { security: [], parameters: [{ name: 'latitude', in: 'query', required: true, schema: { type: 'number' } }], responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { latitude: { type: 'number' }, timezone: { type: 'string' } } } } } } } } } } }));
    await ask([tool('place', { dir })], [], env, yes);
    const [connected] = await ask([tool('connect', { place: dir, source: 'weather', document: join(shared, 'weather.json') })], [shared], env, yes);
    match(text(connected), /1 offers, 1 of them read/); match(text(connected), new RegExp(` scope=region/weather value=${server.url.replace(/[.:/]/g, '\\$&')}$`, 'm'));
    const [read] = await ask([tool('look', { place: dir, source: 'weather', operation: 'get-v1-forecast', args: '{"latitude":52.52}', at: '8' })], [], env, yes);
    match(text(read), /^weather answered 200 to get-v1-forecast\./); match(text(read), / scope=answer\/[0-9a-f]{16}\/timezone value=GMT$/m);
    deepStrictEqual(server.seen.map((one) => one.url), ['/v1/forecast?latitude=52.52']);
  } finally { await server.close(); }
});
