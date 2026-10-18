import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { api, said, text } from './place.ts';

const tool = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });

test('places: what this device has connected — none before a place is founded; then each place the index names with the sources it pinned, the grants standing today and its last read, read off its lines, nothing asked', async () => {
  const server = await api(() => '{"city":"lima","temperature":21}');
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-places-'))];
  const env = { ...fakeKeychain({}).env, HEAD_HOME: home, HOME: home, USERPROFILE: home }, place = join(shared, 'weather'), asked: string[] = [];
  const yes = (params: any) => { asked.push(params.message); return { action: 'accept', content: { yes: true } }; };
  try {
    writeFileSync(join(shared, 'weather.json'), JSON.stringify({ openapi: '3.0.3', info: { title: 'weather', version: '1' }, servers: [{ url: server.url }], paths: { '/forecast': { get: { operationId: 'getForecast', security: [],
      parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'the forecast', content: { 'application/json': { schema: { type: 'object', properties: { city: { type: 'string' } } } } } } } } } } }));
    const [none] = await ask([tool('places', {})], [], env);
    match(text(none), said('unborn')); ok(!existsSync(join(home, 'place')), 'with no place at all, nothing is founded: it says so, and what connect founds');
    await ask([tool('place', { dir: place })], [], env, yes);
    const [fresh] = await ask([tool('places', {})], [], env);
    match(text(fresh), said('place-held')); match(text(fresh), / sources="—" grants="[^"]*" last="—"/);
    await ask([tool('connect', { place, source: 'weather', document: join(shared, 'weather.json') })], [shared], env, yes);
    await ask([tool('look', { place, source: 'weather', operation: 'getForecast', args: { city: 'lima' }, at: '8' })], [], env, yes);
    asked.length = 0;
    const [held, one, other] = await ask([tool('places', {}), tool('places', { place }), tool('places', { place: join(shared, 'elsewhere') })], [], env, yes);
    match(text(held), new RegExp(`name="weather" dir="${place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" sources="weather" grants="[^"]*allow/read[^"]*" last="weather/getForecast at 20\\d\\d-`));
    deepStrictEqual([text(one), asked], [text(held), []], 'one place asked by its folder answers the same; nothing is asked');
    match(text(other), said('places-none'));
  } finally { await server.close(); }
});
