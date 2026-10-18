import { test } from 'node:test';
import { deepStrictEqual, match } from 'node:assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { answered, said, text } from './place.ts';

const tool = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
const document = JSON.stringify({ openapi: '3.0.3', info: { title: 'weather', version: '1' }, paths: { '/forecast': {
  get: { operationId: 'getForecast', security: [], responses: { 200: { description: 'the forecast', content: { 'application/json': { schema: { type: 'object', properties: { city: { type: 'string' } } } } } } } },
  post: { operationId: 'setForecast', security: [], responses: { 200: { description: 'set' } } } } } });
/** An origin on this device that publishes what it is told to, at the paths it is told; every request kept. */
const origin = async (paths: Readonly<Record<string, string>>) => {
  const seen: { method: string; url: string }[] = [];
  const server = createServer((request, response) => { seen.push({ method: request.method ?? '', url: request.url ?? '' }); const body = request.url === '/forecast' ? '{"city":"lima"}' : paths[request.url ?? ''];
    response.writeHead(body === undefined ? 404 : 200, { 'content-type': 'application/json' }); response.end(body ?? ''); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, seen, close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) };
};
/** A device with a home of its own, so the person's first place is founded under it and never under the real one. */
const device = () => ((home) => ({ ...fakeKeychain({}).env, HEAD_HOME: join(home, '.config', 'head'), HOME: home, USERPROFILE: home }))(mkdtempSync(join(tmpdir(), 'head-use-')));
const yes = (asked: string[]) => (params: any) => { asked.push(params.message); return { action: 'accept', content: { yes: true } }; };

test('a site alone, on one yes: its document found where it says (its catalog), the person-s place founded with it, reads granted, and read with no other question; every call that is not a read still asks', async () => {
  const env = device(), asked: string[] = [];
  const catalog = JSON.stringify({ linkset: [{ anchor: '/', 'service-desc': [{ href: '/specs/weather.json', type: 'application/json' }] }] });
  const served = await origin({ '/.well-known/api-catalog': catalog, '/specs/weather.json': JSON.stringify({ ...JSON.parse(document), servers: [{ url: '/' }] }) });
  try {
    const [connected] = await ask([tool('connect', { document: served.url })], [], env, yes(asked));
    match(text(connected), said('born')); match(text(connected), said('ready')); deepStrictEqual(asked.length, 1, 'one yes'); match(asked[0]!, said('elicit-first-run'));
    const place = / place="([^"]+)"/.exec(text(connected).split('\n').find((l) => l.startsWith('said/head/ready '))!)![1]!;
    const [read] = await ask([tool('look', { place, source: '127-0-0-1', operation: 'getForecast', at: '8' })], [], env, yes(asked));
    match(text(read), answered('getForecast', 200)); deepStrictEqual(asked.length, 1, 'reads asked nothing more');
    const [wrote] = await ask([tool('act', { place, source: '127-0-0-1', operation: 'setForecast' })], [], env, () => ({ action: 'decline' }));
    match(text(wrote), said('no-yes')); deepStrictEqual(served.seen.filter((r) => r.method === 'POST').length, 0, 'what is not a read asks, and a no calls nothing');
    deepStrictEqual(served.seen.slice(0, 2).map((r) => r.url), ['/.well-known/api-catalog', '/specs/weather.json'], 'the catalog first, then the document it names');
  } finally { await served.close(); }
});

test('a site with no catalog is looked for at the paths head-s lock names; a site that publishes nothing is said with what was tried, before anything is founded or asked', async () => {
  const [fallback, empty] = [await origin({ '/openapi.json': JSON.stringify({ ...JSON.parse(document), servers: [{ url: '/' }] }) }), await origin({})];
  try {
    const [found] = await ask([tool('connect', { document: fallback.url })], [], device(), yes([]));
    match(text(found), said('connected')); deepStrictEqual(fallback.seen.slice(0, 2).map((r) => r.url), ['/.well-known/api-catalog', '/openapi.json']);
    const asked: string[] = [];
    const [none] = await ask([tool('connect', { document: empty.url })], [], device(), yes(asked));
    match(text(none), said('use-none')); match(text(none), / tried="[^"]*\/openapi\.json/); deepStrictEqual(asked.length, 0, 'nothing asked: nothing was found');
  } finally { await fallback.close(); await empty.close(); }
});

test('a folder holding a document is connected by it: the document found at the names head-s lock knows, the source named for the folder', async () => {
  const env = device(), shared = mkdtempSync(join(tmpdir(), 'head-shared-')), place = join(shared, 'shop'), folder = join(shared, 'Weather API');
  await ask([tool('place', { dir: place })], [], env, yes([]));
  mkdirSync(folder); writeFileSync(join(folder, 'openapi.json'), JSON.stringify({ ...JSON.parse(document), servers: [{ url: 'https://weather.example' }] }));
  const [connected] = await ask([tool('connect', { place, document: folder })], [shared], env, yes([]));
  match(text(connected), said('connected')); match(text(connected), / source="weather-api"/);
});
