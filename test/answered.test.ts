import { test } from 'node:test';
import { ok } from 'node:assert';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { valueOf } from '../src/core/lock.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { lock, root, text, viewOf } from './place.ts';

const call = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
const question = { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' } }, quito = { ...question, args: { city: 'quito' } };
const codes = (answer: any): string[] => answer.result.structuredContent.cells.map((c: any) => c.code);
/** A person whose first connect founds their place against an API that answers each read as the test says: a body, or no byte at all, its connection dropped. */
const person = async (answer: (read: number) => string | undefined) => {
  let reads = 0;
  const server = createServer((request, response) => {
    if (request.url === '/openapi.json') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: origin }], paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } } })); return; }
    reads += 1;
    const body = answer(reads);
    if (body === undefined) { request.socket.destroy(); return; }
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(body);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, mine = mkdtempSync(join(tmpdir(), 'head-answered-'));
  const env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine }, yes = () => ({ action: 'accept', content: { yes: true } });
  const place = join(mine, valueOf(lock, 'first-run/folder'));
  return { place, close: () => server.close(), session: (steps: readonly any[]) => ask([call('connect', { ...question, document: `${origin}/openapi.json` }), ...steps], [], env, yes) };
};

test('yes: a body of nothing is the source-s answer — said with its hour, as it holds it today, and landed with its receipt, never a body; why then shows that answer and its hour', async () => {
  const p = await person(() => '[]');
  try {
    const [, read, why] = await p.session([call('ask', { ...quito, place: p.place }), call('ask', { ...quito, place: p.place, why: true })]);
    const nothing = read.result.structuredContent.cells.find((c: any) => c.code === 'head/answered-nothing');
    ok(nothing && !Number.isNaN(Date.parse(nothing.fields.at)), JSON.stringify(codes(read)));
    ok(/ scope=read\/forecast\/get-forecast\/[0-9a-f]{16} /.test(text(read)) && !/ scope=answer\//.test(text(read)), 'a receipt, and no body');
    ok(codes(why).includes('head/why'), JSON.stringify(codes(why)));
  } finally { p.close(); }
});

test('no: no byte at all is no answer and no receipt — its cause is said and the read stays owed in the place, a need named for its source and operation, until a read of it brings bytes and the need is withdrawn', async () => {
  const p = await person((n) => (n === 2 ? undefined : '{"temperature":21}'));
  const need = ` scope=${valueOf(lock, 'place/needs')}/bytes/forecast/get-forecast `, owed = (place: string) => viewOf(place, 'lines').split('\n').some((l) => l.includes(need) && !l.includes(' value=withdraw'));
  try {
    const [, dropped] = await p.session([call('ask', { ...quito, place: p.place })]);
    const cause = dropped.result.structuredContent.cells.find((c: any) => c.code === 'head/unreachable-source');
    ok(cause && cause.fields.why, JSON.stringify(codes(dropped)));
    ok(!/ scope=read\/forecast\/get-forecast\/[0-9a-f]{16} /.test(text(dropped)) && owed(p.place), 'no receipt, and the read owed');
    const [, arrived] = await p.session([call('ask', { ...quito, place: p.place })]);
    ok(codes(arrived).includes('head/answered') && !owed(p.place), 'the bytes arrived and the need is withdrawn');
  } finally { p.close(); }
});

test('each form a person reads is read at the resolution the lock declares for a person, its own where it says so', () => {
  const forms = [...readFileSync(join(root, 'src/verbs/ask.ts'), 'utf8').matchAll(/read\('([a-z]+)'/g)].map((m) => m[1]!);
  ok(forms.length > 3 && forms.every((form) => valueOf(lock, `resolution/${form}/person`) !== ''), forms.filter((form) => valueOf(lock, `resolution/${form}/person`) === '').join(', '));
});
