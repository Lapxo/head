import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fill } from '../src/core/surface.ts';
import { deviceOf } from '../src/core/device.ts';
import { valueOf } from '../src/core/lock.ts';
import { registryFor } from '../src/ports/signers.ts';
import { run } from './cli.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { line, lock } from './place.ts';

const call = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
const codes = (answer: any): string[] => answer.result.structuredContent.cells.map((c: any) => c.code).filter((c: string) => !['head/card', 'head/red'].includes(c));
const content = (answer: any): number => answer.result.content.map((c: any) => c.text).join('\n').split('\n').filter((l: string) => l.startsWith('bound-lock/1')).length;
const question = { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' } };

/** A person with a home of their own and an API of their own, connected on one yes: the place their first connect founds, its reads counted. */
const person = async () => {
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
    const landed = run('@lapxo/bound', place, ['land', lot, '--key', key, '--signer', deviceOf(lock).signer], { ...env, BOUND_SIGNERS: registryFor(deviceOf(lock).signer, `${deviceOf(lock).service}/head`, account, key, valueOf(lock, 'founding/algorithm'), valueOf(lock, `platform/${process.platform}/store`)) });
    deepStrictEqual(landed?.code, 0, [...(landed?.out ?? []), ...(landed?.err ?? [])].join('\n'));
  };
  return { place, asking, rooted, reads: () => reads, close: () => server.close() };
};

test('yes, over two places: the connect reads its question ahead, so the question is handed that receipt-s body once; asked again in the same conversation it is kept — the source, the hour and the digests, no body and no receipt line — and nothing is called; a new conversation is handed the body once', async () => {
  const [a, b] = [await person(), await person()];
  const [[firstA, againA], [firstB, againB], [laterA]] = await (async () => { try { return [await a.asking(2), await b.asking(2), await a.asking()]; } finally { a.close(); b.close(); } })();
  deepStrictEqual([codes(firstA), codes(againA), codes(firstB), codes(againB)], [['head/answered', 'head/reused'], ['head/kept'], ['head/answered', 'head/reused'], ['head/kept']]);
  deepStrictEqual([content(againA), content(againB), a.reads(), b.reads()], [0, 0, 1, 1], 'what the model already holds is not sent again, and the source is called once, ahead');
  ok(codes(laterA).includes('head/reused') && content(laterA) > 0 && a.reads() === 1, JSON.stringify(codes(laterA)));
});

for (const [why, change] of [
  ['withdrawn', () => [line(valueOf(lock, 'grant/family'), 'until', '2000-01-01', { at: 'policy:head/first-run' })]],
  ['changed', () => [line(`${valueOf(lock, 'vocab/offers')}/forecast/elsewhere`, 'class', 'listed')]],
  ['expired', () => [line(`${valueOf(lock, 'reuse/family')}/forecast`, 'seconds', '0..0', { form: 'interval' })]],
] as const) test(`no, over two places: a receipt that stands but whose context moved (${why}) is never answered from what was kept — the source is called again and the cell says so; the other place, unmoved, still answers from it`, async () => {
  const [a, b] = [await person(), await person()];
  const [[movedA], [stillB]] = await (async () => { try { await a.asking(); await b.asking(); a.rooted(change()); return [await a.asking(), await b.asking()]; } finally { a.close(); b.close(); } })();
  deepStrictEqual([codes(movedA).filter((c) => c.startsWith('head/kept')), codes(movedA).includes('head/answered'), a.reads()], [[`head/kept-${why}`], true, 2], JSON.stringify(codes(movedA)));
  deepStrictEqual([codes(stillB).includes('head/reused'), b.reads()], [true, 1], JSON.stringify(codes(stillB)));
});
