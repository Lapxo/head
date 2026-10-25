import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { mkdirSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { valueOf } from '../../src/core/lock.ts';
import { ask } from '../client.ts';
import { fakeKeychain } from '../fake-keychain.ts';
import { lock } from '../place.ts';

/** What the same question asked again keeps on disk, part by part of the place's .bound and of the folder head keeps its reads in, after the first answer and after five more; a new question is its control, the growth the measure must see; measured, not judged, until a ceiling is signed on this number. */
test('store/bytes: what the same question asked again adds to the place and to head-s reads', async (t) => {
  const document = JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: '' }], paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } } });
  let calls = 0;
  const server = createServer((request, response) => { calls += request.url === '/openapi.json' ? 0 : 1; response.writeHead(200, { 'content-type': 'application/json' }); response.end(request.url === '/openapi.json' ? document.replace('"url":""', `"url":"${origin}"`) : '{"temperature":21}'); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, mine = mkdtempSync(join(tmpdir(), 'head-store-')), tmp = join(mine, 'tmp');
  mkdirSync(tmp);
  const env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine, TMPDIR: tmp }, place = join(mine, valueOf(lock, 'first-run/folder'));
  const lima = { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' } }, again = (n: number) => [...Array(n)].map(() => ({ method: 'tools/call', params: { name: 'ask', arguments: { place, ...lima } } }));
  const walk = (at: string): string[] => (statSync(at).isDirectory() ? readdirSync(at).flatMap((e) => walk(join(at, e))) : [at]);
  const parts = () => Object.fromEntries([...readdirSync(join(place, '.bound')).map((p) => [`.bound/${p}`, join(place, '.bound', p)]), ...readdirSync(tmp).map((p) => [p, join(tmp, p)])].map(([name, at]) => ((files) => [name, { files: files.length, bytes: files.reduce((n, f) => n + statSync(f).size, 0) }])(walk(at!))));
  await ask([{ method: 'tools/call', params: { name: 'connect', arguments: { ...lima, document: `${origin}/openapi.json` } } }], [], env, () => ({ action: 'accept', content: { yes: true } }));
  const [first, called] = [parts(), calls];
  const repeats = await ask(again(5), [], env), repeated = calls;
  const [after, delta] = [parts(), (name: string) => ({ files: (after[name]?.files ?? 0) - (first[name]?.files ?? 0), bytes: (after[name]?.bytes ?? 0) - (first[name]?.bytes ?? 0) })];
  await ask([{ method: 'tools/call', params: { name: 'ask', arguments: { place, ...lima, args: { city: 'cusco' } } } }], [], env);
  const grown = parts()['.bound/ledger']!.bytes - after['.bound/ledger']!.bytes;
  server.close();
  deepStrictEqual([called, repeated, repeats.map((a: any) => a.result.structuredContent.cells.some((c: any) => ['head/kept', 'head/reused', 'head/reread'].includes(c.code)))], [1, 1, [true, true, true, true, true]], 'the five repeats are answered from what was kept, with no call');
  deepStrictEqual([calls, grown > 0], [2, true], 'the control: a new question calls once and the ledger grows, so the measure sees growth where there is some');
  t.diagnostic(`MEASURED store/bytes model=files-on-disk · after the first answer: ${Object.entries(first).map(([n, s]) => `${n} ${s.files} files ${s.bytes} B`).join(' · ')} · a new question added ${grown} B to the ledger · five repeats added: ${[...new Set([...Object.keys(first), ...Object.keys(after)])].map((n) => `${n} +${delta(n).files} files +${delta(n).bytes} B`).join(' · ')}`);
});
