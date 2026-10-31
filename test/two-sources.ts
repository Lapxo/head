import { homeServices } from '../src/ports/home.ts';
import { deepStrictEqual } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deviceOf } from '../src/core/device.ts';
import { members, valueOf } from '../src/core/lock.ts';
import { fill } from '../src/core/surface.ts';
import { registryFor } from './signers.ts';
import { run } from './cli.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { lock } from './place.ts';

const call = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
const cells = (answer: any): any[] => answer.result.structuredContent.cells.filter((c: any) => !['head/card', 'head/red'].includes(c.code));
export const [own, other] = members(valueOf(lock, 'marks/mark'));
const forecast = (origin: string) => JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: origin }], paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }],
  responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { temperature: { type: 'number' }, sky: { type: 'string' } } } } } } } } } } });
/** An API of its own that types its answer: what it answers, as the test says. */
export const api = async (body: () => string) => {
  const server = createServer((request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(request.url === '/openapi.json' ? forecast(origin) : body()); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { document: `${origin}/openapi.json`, close: () => server.close() };
};
/** A person whose place connects two sources, each from the address given; asking them one question at once. */
export const person = async (a: string, b: string) => {
  const mine = mkdtempSync(join(tmpdir(), 'head-marks-')), env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine }, yes = () => ({ action: 'accept', content: { yes: true } });
  const place = join(mine, valueOf(lock, 'first-run/folder')), question = { operation: 'get-forecast', args: { city: 'lima' } };
  await ask([call('connect', { source: 'forecast', ...question, document: a }), call('connect', { place, source: 'mirror', document: b })], [], env, yes);
  const rooted = (lines: readonly string[]) => {
    const lot = join(mkdtempSync(join(tmpdir(), 'head-marks-lot-')), 'lot.bound');
    writeFileSync(lot, `${lines.join('\n')}\n`);
    const [account, key, signer] = [fill(valueOf(lock, 'founding/root-account'), { place: 'place' }), valueOf(lock, 'founding/root').split('/')[1]!, deviceOf(lock).signer];
    const landed = run('@lapxo/bound', place, ['land', lot, '--key', key, '--signer', signer], { ...env, BOUND_SIGNERS: registryFor(signer, homeServices(deviceOf(lock).service, env.HEAD_HOME).primary, account, key, valueOf(lock, 'founding/algorithm'), valueOf(lock, `platform/${process.platform}/store`)) });
    deepStrictEqual(landed?.code, 0, [...(landed?.out ?? []), ...(landed?.err ?? [])].join('\n'));
  };
  const receipts = (): ReadonlySet<string> => new Set((run('@lapxo/bound', place, ['fold', '--as', 'evidence'], env)?.out ?? []).filter((l) => l.includes(` scope=${valueOf(lock, 'receipt/family')}/`) && l.includes(' measure=digest ')).map((l) => / value=(sha256:[0-9a-f]{64})/.exec(l)?.[1] ?? ''));
  return { rooted, receipts, asked: async (sources = 'forecast|mirror') => cells((await ask([call('ask', { place, sources, ...question })], [], env, yes))[0]) };
};
