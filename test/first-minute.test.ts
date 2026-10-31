import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aboutOf, valueOf } from '../src/core/lock.ts';
import { fill } from '../src/core/surface.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { lock } from './place.ts';

const forecast = (origin: string) => JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: origin }],
  paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } } });
const call = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
const cells = (answer: any): any[] => answer.result.structuredContent.cells;
const codes = (answer: any): string[] => cells(answer).map((c) => c.code);

/** A person with a fresh home and an API of their own: its document answers once it is up, and the API answers a read. */
const person = async () => {
  const seen: string[] = [];
  let up = true;
  const server = createServer((request, response) => { seen.push(request.url ?? ''); const doc = request.url === '/openapi.json'; response.writeHead(doc && !up ? 503 : 200, { 'content-type': 'application/json' }); response.end(doc ? forecast(origin) : '{"temperature":21}'); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, mine = mkdtempSync(join(tmpdir(), 'head-person-')), keychain = fakeKeychain({}), asked: string[] = [];
  const env = { ...keychain.env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine };
  const yes = (params: any) => { asked.push(params.message); return { action: 'accept', content: { yes: true } }; };
  return { origin, document: `${origin}/openapi.json`, place: join(mine, 'place'), seen, asked, keychain, env, yes, down: () => { up = false; }, back: () => { up = true; }, close: () => server.close() };
};
const question = { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' } };

test('with no place, ask founds nothing and asks nothing: it says no place stands, and its next is the connect that founds one, the question carried', async () => {
  const p = await person();
  const [unborn] = await ask([call('ask', question)], [], p.env, p.yes);
  p.close();
  deepStrictEqual([codes(unborn), p.asked.length, existsSync(p.place), p.seen.length], [['head/unborn'], 0, false, 0]);
  deepStrictEqual(cells(unborn)[0].next.tool, 'connect');
  deepStrictEqual([cells(unborn)[0].next.args.source, cells(unborn)[0].next.args.operation, cells(unborn)[0].next.args.document], ['forecast', 'get-forecast', '']);
});

test('the first connect founds the place on one yes that names all it grants, connects the API and lets head read it; its next is the question, which is then answered with nothing more asked', async () => {
  const p = await person();
  const [connected] = await ask([call('connect', { ...question, document: p.document })], [], p.env, p.yes);
  const ready = cells(connected).find((c) => c.code === 'head/ready');
  const [answered] = await ask([call('ask', { ...question, place: ready?.fields.place })], [], p.env, p.yes);
  p.close();
  const until = /until (\d{4}-\d\d-\d\d)/.exec(p.asked[0] ?? '')?.[1];
  deepStrictEqual(p.asked, [fill(aboutOf(lock, 'said/elicit-first-run'), { dir: p.place, source: 'forecast', document: p.document, until })], 'one question, in the lock-s own words: found, connect, read');
  ok(['head/born', 'head/connected', 'head/ready'].every((c) => codes(connected).includes(c)), JSON.stringify(codes(connected)));
  deepStrictEqual([ready.next.tool, ready.next.args.operation, ready.next.args.source], ['ask', 'get-forecast', 'forecast']);
  ok(['head/answered', 'head/untyped'].some((c) => codes(answered).includes(c)) && p.seen.some((u) => u.startsWith('/forecast')), JSON.stringify(codes(answered)));
});

test('a document that does not arrive is no refusal: the place is founded owing it, nothing is answered or called; asked again once it arrives, it is connected and answered, and nothing more is asked', async () => {
  const p = await person();
  p.down();
  const [owing] = await ask([call('connect', { ...question, document: p.document })], [], p.env, p.yes);
  p.back();
  const [paid] = await ask([call('ask', { ...question, place: p.place })], [], p.env, p.yes);
  p.close();
  deepStrictEqual([p.asked.length, codes(owing).includes('head/born'), codes(owing).includes('head/bytes-owed'), codes(owing).includes('head/connected')], [1, true, true, false], JSON.stringify(codes(owing)));
  ok(codes(paid).includes('head/connected') && ['head/answered', 'head/untyped'].some((c) => codes(paid).includes(c)), JSON.stringify(codes(paid)));
  deepStrictEqual(p.seen.filter((u) => u.startsWith('/forecast')).length, 1, 'the API is called only once the document arrived');
});

test('one yes: a first connect whose document declares how access is proven tries it within the same yes; a secret entered by hand still waits on the root-s allowance, said, and nothing more is asked', async () => {
  const p = await person();
  const bearer = (origin: string) => JSON.stringify({ ...JSON.parse(forecast(origin)), components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } }, security: [{ bearer: [] }] });
  const server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(bearer(p.origin)); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const [connected] = await ask([call('connect', { ...question, document: `http://127.0.0.1:${(server.address() as AddressInfo).port}/openapi.json` })], [], p.env, p.yes);
  server.close(); p.close();
  deepStrictEqual(p.asked.length, 1, 'one yes');
  ok(['head/born', 'head/connected', 'head/secret-unallowed', 'head/ready'].every((c) => codes(connected).includes(c)), JSON.stringify(codes(connected)));
});

test('a no founds nothing, connects nothing and grants nothing', async () => {
  const p = await person();
  const [declined] = await ask([call('connect', { ...question, document: p.document })], [], p.env, () => ({ action: 'decline' }));
  p.close();
  deepStrictEqual([codes(declined), existsSync(p.place), p.keychain.argv().includes('place/place/root')], [['head/no-yes'], false, false]);
});

test('first-minute/connects: head-s own lock names no API for a person to connect; what its sources name is where head-s own pieces are released', () => {
  const own = /^https:\/\/(github\.com\/Lapxo\/|registry\.npmjs\.org\/@(lapxo|modelcontextprotocol)\/)/;
  const named = lock.filter((l) => l.scope?.startsWith('sources/') && URL.canParse(l.value ?? '') && !own.test(l.value!)).map((l) => l.scope);
  ok(named.length <= Number(valueOf(lock, 'first-minute/connects').split('..')[1]), named.join(' '));
  deepStrictEqual(lock.filter((l) => /^(prose\/en\/(readme|idea|page\/)|prompt\/[^/]+\/text$)/.test(l.scope ?? '') && /https?:\/\/(?!github\.com\/Lapxo\/|img\.shields\.io\/(?:npm\/v\/@lapxo\/head|badge\/license-MIT-blue)(?:[)\s]|$)|www\.npmjs\.com\/package\/@lapxo\/head(?:[)\s]|$))[a-z0-9.-]+/.test(l.about ?? '')).map((l) => l.scope), [], 'no page or prompt points at an API to connect');
});
