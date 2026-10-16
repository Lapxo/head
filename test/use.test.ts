import { test } from 'node:test';
import { deepStrictEqual, match } from 'node:assert';
import { mkdtempSync } from 'node:fs';
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
const device = () => ({ ...fakeKeychain({}).env, HEAD_HOME: join(mkdtempSync(join(tmpdir(), 'head-use-')), 'home') });
const yes = (asked: string[]) => (params: any) => { asked.push(params.message); return { action: 'accept', content: { yes: true } }; };

test('one address, one yes: an origin that publishes its catalog is used on a single yes — a read-only place of its own, its document found and compiled, every call that is not a read capped at zero, reads granted — and then read without another question; used again, it is held', async () => {
  const env = device(), asked: string[] = [];
  const catalog = JSON.stringify({ linkset: [{ anchor: '/', 'service-desc': [{ href: '/specs/weather.json', type: 'application/json' }] }] });
  const served = await origin({ '/.well-known/api-catalog': catalog, '/specs/weather.json': JSON.stringify({ ...JSON.parse(document), servers: [{ url: '/' }] }) });
  try {
    const [used] = await ask([tool('connect', { document: served.url })], [], env, yes(asked));
    match(text(used), said('used')); deepStrictEqual(asked.length, 1, 'one yes'); match(asked[0]!, said('elicit-use'));
    const place = / dir="([^"]+)"/.exec(text(used))![1]!;
    const [read] = await ask([tool('look', { place, source: '127-0-0-1', operation: 'getForecast', at: '8' })], [], env, yes(asked));
    match(text(read), answered('getForecast', 200)); deepStrictEqual(asked.length, 1, 'reads asked nothing more');
    const [wrote] = await ask([tool('act', { place, source: '127-0-0-1', operation: 'setForecast' })], [], env, yes(asked));
    match(text(wrote), said('not-allowed')); deepStrictEqual(served.seen.filter((r) => r.method === 'POST').length, 0, 'nothing that is not a read is ever called');
    const [listed, again] = await ask([tool('places', {}), tool('connect', { document: served.url })], [], env, yes(asked));
    match(text(listed), /name="127-0-0-1" [^\n]*sources="127-0-0-1" grants="[^"]*allow\/127-0-0-1 calls 0\.\.0[^"]*allow\/read sources 127-0-0-1/);
    match(text(again), said('use-held')); deepStrictEqual(asked.length, 1);
    deepStrictEqual(served.seen.slice(0, 2).map((r) => r.url), ['/.well-known/api-catalog', '/specs/weather.json'], 'the catalog first, then the document it names');
  } finally { await served.close(); }
});

test('an origin with no catalog is looked for at the paths head-s lock names, the first a world compiles connected; an origin that publishes nothing is said with what was tried, its place founded and nothing connected', async () => {
  const [fallback, empty] = [await origin({ '/openapi.json': JSON.stringify({ ...JSON.parse(document), servers: [{ url: '/' }] }) }), await origin({})];
  try {
    const [found] = await ask([tool('connect', { document: fallback.url })], [], device(), yes([]));
    match(text(found), said('used')); deepStrictEqual(fallback.seen.slice(0, 2).map((r) => r.url), ['/.well-known/api-catalog', '/openapi.json']);
    const asked: string[] = [];
    const [none] = await ask([tool('connect', { document: empty.url })], [], device(), yes(asked));
    match(text(none), said('use-none')); match(text(none), / tried="[^"]*\/openapi\.json/); deepStrictEqual(asked.length, 1);
  } finally { await fallback.close(); await empty.close(); }
});
