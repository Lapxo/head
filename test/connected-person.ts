import { homeServices } from '../src/ports/home.ts';
import { deepStrictEqual } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fill } from '../src/core/surface.ts';
import { deviceOf } from '../src/core/device.ts';
import { valueOf } from '../src/core/lock.ts';
import { registryFor } from './signers.ts';
import { run } from './cli.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { lock } from './place.ts';

const call = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
export const codes = (answer: any): string[] => answer.result.structuredContent.cells.map((c: any) => c.code).filter((c: string) => !['head/card', 'head/red'].includes(c));
export const content = (answer: any): number => answer.result.content.map((c: any) => c.text).join('\n').split('\n').filter((l: string) => l.startsWith('bound-lock/1')).length;
const question = { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' } };

/** A person with a home of their own and an API of their own, connected on one yes: the place their first connect founds, its reads counted. */
export const person = async () => {
  let reads = 0;
  const server = createServer((request, response) => { const doc = request.url === '/openapi.json'; if (!doc) reads += 1; response.writeHead(200, { 'content-type': 'application/json' });
    response.end(doc ? JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: origin }], paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } } }) : '{"temperature":21}'); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, mine = mkdtempSync(join(tmpdir(), 'head-kept-')), keychain = fakeKeychain({});
  const env = { ...keychain.env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine }, yes = () => ({ action: 'accept', content: { yes: true } });
  await ask([call('connect', { ...question, document: `${origin}/openapi.json` })], [], env, yes);
  const place = join(mine, valueOf(lock, 'first-run/folder')), asking = (n = 1) => ask(Array.from({ length: n }, () => call('ask', { ...question, place })), [], env, yes);
  /** Lines the place's root signs, as the person would: through the keychain that holds it, never a file. */
  const rooted = (lines: readonly string[]) => {
    const lot = join(mkdtempSync(join(tmpdir(), 'head-kept-lot-')), 'lot.bound');
    writeFileSync(lot, `${lines.join('\n')}\n`);
    const account = fill(valueOf(lock, 'founding/root-account'), { place: 'place' }), key = valueOf(lock, 'founding/root').split('/')[1]!;
    const landed = run('@lapxo/bound', place, ['land', lot, '--key', key, '--signer', deviceOf(lock).signer], { ...env, BOUND_SIGNERS: registryFor(deviceOf(lock).signer, homeServices(deviceOf(lock).service, env.HEAD_HOME).primary, account, key, valueOf(lock, 'founding/algorithm'), valueOf(lock, `platform/${process.platform}/store`)) });
    deepStrictEqual(landed?.code, 0, [...(landed?.out ?? []), ...(landed?.err ?? [])].join('\n'));
  };
  return { place, asking, rooted, reads: () => reads, close: () => server.close() };
};
