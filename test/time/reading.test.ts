import { test } from 'node:test';
import { ok } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { availableParallelism, loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';
import { members, valueOf } from '../../src/core/lock.ts';
import { readingOf } from '../../src/ports/reading.ts';
import { run } from '../cli.ts';
import { ask } from '../client.ts';
import { fakeKeychain } from '../fake-keychain.ts';
import { lock } from '../place.ts';

/**
 * What it costs to know whether a place moved, beside what a fold of it costs: the reading head keys its folds by is taken
 * on every ask, so it must stay far cheaper than the fold it spares. Measured on a place a person founded and asked of, with
 * every read it landed in its ledger; the first reading pays for hashing bound as installed, the later ones do not.
 */
test('reading/seconds: the reading a fold is kept under costs far less than the fold it spares', async (t) => {
  const document = JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: '' }], paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } } });
  const server = createServer((request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(request.url === '/openapi.json' ? document.replace('"url":""', `"url":"${origin}"`) : '{"temperature":21}'); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, mine = mkdtempSync(join(tmpdir(), 'head-reading-'));
  const env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine }, place = join(mine, valueOf(lock, 'first-run/folder'));
  const call = (args: Record<string, unknown>) => ({ method: 'tools/call', params: { name: 'ask', arguments: { source: 'forecast', operation: 'get-forecast', ...args } } });
  await ask([{ method: 'tools/call', params: { name: 'connect', arguments: { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' }, document: `${origin}/openapi.json` } } }, ...['quito', 'cusco', 'arequipa', 'trujillo'].map((city) => call({ place, args: { city } }))], [], env, () => ({ action: 'accept', content: { yes: true } }));
  server.close();
  const reading = () => readingOf(place, members(valueOf(lock, 'reading/apart')), valueOf(lock, 'reading/environment'));
  const timed = (f: () => unknown) => { const at = performance.now(); f(); return performance.now() - at; };
  const first = timed(reading), later = Array.from({ length: 10 }, () => timed(reading)).sort((a, b) => a - b)[5]!;
  const folding = timed(() => run('@lapxo/bound', place, [valueOf(lock, 'bound/read'), valueOf(lock, 'bound/view'), valueOf(lock, 'bound/evidence')]));
  t.diagnostic(`MEASURED reading/seconds model=machine-clock · first ${(first / 1000).toFixed(3)} s (bound hashed as installed) · later ${(later / 1000).toFixed(3)} s · one fold of evidence ${(folding / 1000).toFixed(3)} s · load ${loadavg()[0]!.toFixed(2)} on ${availableParallelism()} cpus`);
  ok(later * 10 < folding, `a reading of ${later.toFixed(1)} ms beside a fold of ${folding.toFixed(1)} ms`);
});
