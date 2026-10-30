import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { api, said, text, lock } from './place.ts';
import { rootIn } from '../src/flows/device.ts';
import type { Context } from '../src/core/answer.ts';
import { valueOf } from '../src/core/lock.ts';

const tool = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });

for (const name of ['weather', 'climate']) test(`places (${name}): what this device has connected — none before a place is founded; then each place the index names with the sources it pinned, the grants standing today and its last read, read off its lines, nothing asked`, async () => {
  const server = await api(() => '{"city":"lima","temperature":21}');
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-places-'))];
  const env = { ...fakeKeychain({}).env, HEAD_HOME: home, HOME: home, USERPROFILE: home }, place = join(shared, 'weather'), asked: string[] = [];
  const yes = (params: any) => { asked.push(params.message); return { action: 'accept', content: { yes: true } }; };
  try {
    writeFileSync(join(shared, 'weather.json'), JSON.stringify({ openapi: '3.0.3', info: { title: 'weather', version: '1' }, servers: [{ url: server.url }], paths: { '/forecast': { get: { operationId: 'getForecast', security: [],
      parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'the forecast', content: { 'application/json': { schema: { type: 'object', properties: { city: { type: 'string' } } } } } } } } } } }));
    const [none] = await ask([tool('places', {})], [], env);
    match(text(none), said('unborn')); ok(!existsSync(join(home, 'place')), 'with no place at all, nothing is founded: it says so, and what connect founds');
    await ask([tool('place', { dir: place, name })], [], env, yes);
    const [fresh] = await ask([tool('places', {})], [], env);
    match(text(fresh), said('place-held')); match(text(fresh), / sources="—" grants="[^"]*" last="—"/);
    await ask([tool('connect', { place, source: 'weather', document: join(shared, 'weather.json') })], [shared], env, yes);
    await ask([tool('look', { place, source: 'weather', operation: 'getForecast', args: { city: 'lima' }, at: '8' })], [], env, yes);
    const [packed] = await ask([tool('share', { place, to: join(shared, 'package') })], [shared], env, yes);
    match(text(packed), said('shared')); ok(existsSync(join(shared, 'package', 'TARGET.bound')));
    asked.length = 0;
    const [held, one, other] = await ask([tool('places', {}), tool('places', { place }), tool('places', { place: join(shared, 'elsewhere') })], [], env, yes);
    match(text(held), new RegExp(`name="${name}" dir="${place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" sources="weather" grants="[^"]*allow/read[^"]*" last="weather/getForecast at 20\\d\\d-`));
    deepStrictEqual([text(one), asked], [text(held), []], 'one place asked by its folder answers the same; nothing is asked');
    match(text(other), said('places-none'));
  } finally { await server.close(); }
});


test('foundation: a raw do/place needs consent but no card for a fresh folder; existing state is never overwritten', async () => {
  const home = mkdtempSync(join(tmpdir(), 'head-foundation-')), parent = mkdtempSync(join(tmpdir(), 'head-foundation-docs-'));
  const env = { ...fakeKeychain({}).env, HEAD_HOME: home, HOME: home, USERPROFILE: home };
  const yes = () => ({ action: 'accept', content: { yes: true } });
  const raw = (dir: string) => tool('do', { action: 'place', dir });
  const declined = join(parent, 'declined'), fresh = join(parent, 'fresh');
  const [no] = await ask([raw(declined)], [], env, () => ({ action: 'decline' }));
  match(text(no), said('no-yes')); ok(!existsSync(join(declined, 'TARGET.bound')));
  const [born] = await ask([raw(fresh)], [], env, yes);
  match(text(born), said('born'));
  const original = readFileSync(join(fresh, 'TARGET.bound'));
  const [existing] = await ask([raw(fresh)], [], env, yes);
  ok(!text(existing).includes('said/head/born ')); deepStrictEqual(readFileSync(join(fresh, 'TARGET.bound')), original);
  for (const [name, corrupt] of [['empty', false], ['corrupt', true]] as const) {
    const dir = join(parent, name); mkdirSync(join(dir, '.bound'), { recursive: true });
    if (corrupt) writeFileSync(join(dir, '.bound', 'bound.keys'), 'invalid');
    const [refused] = await ask([tool('place', { dir })], [], env, yes);
    match(text(refused), said('place-exists')); ok(!existsSync(join(dir, 'TARGET.bound')));
    if (corrupt) deepStrictEqual(readFileSync(join(dir, '.bound', 'bound.keys'), 'utf8'), 'invalid');
  }
});


test('foundation identity: an index locates an account, but only a matching authenticated root selects it', async () => {
  const place = '/fixture/documents', home = '/fixture/home', root = valueOf(lock, 'founding/root'), family = valueOf(lock, 'home/family');
  const index = { lines: [{ scope: `${family}/observations`, measure: 'id', value: place }] };
  const standing = { lines: [{ scope: root, measure: 'public-key', value: 'root-public' }] };
  const held: string[] = [];
  const context = (options: { index?: unknown; standing?: unknown; key?: string } = {}) => ({
    lock, home: () => home, files: { has: () => true }, keys: { held: (account: string) => { held.push(account); return options.key ?? 'root-public'; } },
    policy: async (at: string) => at === home ? options.index ?? index : options.standing ?? standing,
  }) as unknown as Context;
  deepStrictEqual(await rootIn(context(), place), { account: 'place/observations/root' });
  deepStrictEqual(held, ['place/observations/root']);
  for (const options of [
    { key: 'another-public-key' }, { index: { refused: 'unauthenticated-index' } },
    { standing: { refused: 'unauthenticated-place' } }, { standing: { lines: [] } },
    { index: { lines: [...index.lines, { scope: `${family}/another`, value: place }] } },
  ]) ok('said' in await rootIn(context(options), place));
  deepStrictEqual(await rootIn(context({ index: { lines: [] } }), place), { account: 'place/documents/root' }, 'legacy account lookup still requires matching public bytes');
});
