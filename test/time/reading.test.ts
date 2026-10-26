import { test } from 'node:test';
import { ok } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { availableParallelism, loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';
import { valueOf } from '../../src/core/lock.ts';
import { run as instrument } from '../../src/ports/bound.ts';
import { cooled, hosted, configureHost } from '../../src/ports/host.ts';
import { readingOf, run } from '../cli.ts';
import { ask } from '../client.ts';
import { fakeKeychain } from '../fake-keychain.ts';
import { lock } from '../place.ts';

/**
 * What it costs to know whether a place moved, beside what a fold of it costs. The public identity head keys its folds by is taken
 * on every ask. Cold startup is reported separately; the warm query
 * goes through the place's fold host as head's do, its start outside the clock, with authentication and input capture inside it.
 */
test('reading/seconds: native identity startup, warm query and evidence fold are measured separately', async (t) => {
  const document = JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: '' }], paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } } });
  const server = createServer((request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(request.url === '/openapi.json' ? document.replace('"url":""', `"url":"${origin}"`) : '{"temperature":21}'); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, mine = mkdtempSync(join(tmpdir(), 'head-reading-'));
  const env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine }, place = join(mine, valueOf(lock, 'first-run/folder'));
  const call = (args: Record<string, unknown>) => ({ method: 'tools/call', params: { name: 'ask', arguments: { source: 'forecast', operation: 'get-forecast', ...args } } });
  await ask([{ method: 'tools/call', params: { name: 'connect', arguments: { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' }, document: `${origin}/openapi.json` } } }, ...['quito', 'cusco', 'arequipa', 'trujillo'].map((city) => call({ place, args: { city } }))], [], env, () => ({ action: 'accept', content: { yes: true } }));
  server.close();
  const reading = async (warm = false) => { const args = [valueOf(lock, 'bound/read'), valueOf(lock, 'bound/view'), `${valueOf(lock, 'bound/identity')}@${valueOf(lock, 'bound/evidence')}`], got = readingOf(warm ? await hosted(place, args) : await instrument('@lapxo/bound', place, args), valueOf(lock, 'bound/evidence')); ok(!('refused' in got), JSON.stringify(got)); return got; };
  const timed = async (f: () => unknown) => { const at = performance.now(); await f(); return performance.now() - at; };
  const first = await timed(() => reading()), samples: number[] = [];
  configureHost(lock, { wait: Number(valueOf(lock, 'bound/wait').split('..')[1]), most: Number(valueOf(lock, 'bound/printed').split('..')[1]) });
  try {
    await reading(true);
    for (let i=0;i<10;i+=1) samples.push(await timed(() => reading(true)));
    const later=samples.sort((a,b)=>a-b)[5]!, folding=await timed(()=>{const result=run('@lapxo/bound', place, [valueOf(lock, 'bound/read'), valueOf(lock, 'bound/view'), valueOf(lock, 'bound/evidence')]);ok(result?.code===0, result?.err.join('\n')??'evidence fold unavailable');});
    t.diagnostic(`MEASURED reading/seconds model=machine-clock · cold ${(first/1000).toFixed(3)} s · warm ${(later/1000).toFixed(3)} s · one fold of evidence ${(folding/1000).toFixed(3)} s · load ${loadavg()[0]!.toFixed(2)} on ${availableParallelism()} cpus · host start outside query clock`);
  } finally {cooled();}
});
