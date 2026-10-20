import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { markOf, overOf } from '../src/ahead/budget.ts';
import { deviceOf } from '../src/core/device.ts';
import { members, valueOf } from '../src/core/lock.ts';
import { fill } from '../src/core/surface.ts';
import { registryFor } from '../src/ports/signers.ts';
import { run } from './cli.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { line, lock } from './place.ts';

const call = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
const codes = (answer: any): string[] => answer.result.structuredContent.cells.map((c: any) => c.code).filter((c: string) => c !== 'head/card');
const files = (at: string): readonly string[] => (!existsSync(at) ? [] : statSync(at).isDirectory() ? readdirSync(at).flatMap((n) => files(join(at, n))) : [at]);
const question = { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' } };
const mark = valueOf(lock, 'ahead/mark');
/** Whether a read ahead landed its mark in a place: its ledger read as it stands, what bound writes as it runs and by digest left aside. */
const marked = (place: string): boolean => files(join(place, '.bound')).filter((f) => !members(valueOf(lock, 'reading/apart')).some((a) => f.startsWith(join(place, a)))).some((f) => { try { return readFileSync(f, 'latin1').includes(`/${mark} `); } catch { return false; } });

/** A person with an API of their own, its reads counted and answered as the test says; their first connect founds their place. */
const person = async (status = () => 200) => {
  let reads = 0;
  const server = createServer((request, response) => { const doc = request.url === '/openapi.json'; if (!doc) reads += 1; response.writeHead(doc ? 200 : status(), { 'content-type': 'application/json' });
    response.end(doc ? JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: origin }], paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } } }) : '{"temperature":21}'); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, mine = mkdtempSync(join(tmpdir(), 'head-ahead-')), keychain = fakeKeychain({});
  const env = { ...keychain.env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine }, yes = () => ({ action: 'accept', content: { yes: true } });
  const place = join(mine, valueOf(lock, 'first-run/folder')), connect = call('connect', { ...question, document: `${origin}/openapi.json` }), asking = call('ask', { ...question, place });
  /** Until the read ahead landed its mark, or a few seconds passed: what head reads ahead it reads between two calls. */
  const landed = async () => { for (let i = 0; i < 100 && !marked(place); i += 1) await new Promise((r) => setTimeout(r, 100)); };
  const rooted = (lines: readonly string[]) => {
    const lot = join(mkdtempSync(join(tmpdir(), 'head-ahead-lot-')), 'lot.bound');
    writeFileSync(lot, `${lines.join('\n')}\n`);
    const [account, key] = [fill(valueOf(lock, 'founding/root-account'), { place: 'place' }), valueOf(lock, 'founding/root').split('/')[1]!];
    const landing = run('@lapxo/bound', place, ['land', lot, '--key', key, '--signer', deviceOf(lock).signer], { ...env, BOUND_SIGNERS: registryFor(deviceOf(lock).signer, `${deviceOf(lock).service}/head`, account, key, valueOf(lock, 'founding/algorithm'), valueOf(lock, `platform/${process.platform}/store`)) });
    deepStrictEqual(landing?.code, 0, [...(landing?.out ?? []), ...(landing?.err ?? [])].join('\n'));
  };
  const session = (steps: readonly any[]) => (async () => { try { return await ask(steps, [], env, yes); } finally { server.close(); } })();
  return { place, connect, asking, landed, rooted, session, reads: () => reads, between: (step: () => unknown) => ({ method: 'between', params: step }) };
};

test('yes, over two places: a connect whose next is the question reads it ahead, so the question finds its receipt and the source is not called again; the body was never shown, so it is handed once', async () => {
  for (const _ of [1, 2]) {
    const p = await person();
    let before = -1;
    const [, answered] = await p.session([p.connect, p.between(async () => { await p.landed(); before = p.reads(); }), p.asking]);
    deepStrictEqual([before, p.reads(), codes(answered).includes('head/reused'), codes(answered).includes('head/kept')], [1, 1, true, false], JSON.stringify(codes(answered)));
  }
});

test('no, over two places: a read ahead whose context moved before the question — the source pinned otherwise — is never answered from; the other place, unmoved, is', async () => {
  const a = await person();
  const [, moved] = await a.session([a.connect, a.between(async () => { await a.landed(); a.rooted([line(`${valueOf(lock, 'vocab/offers')}/forecast/elsewhere`, 'class', 'listed')]); }), a.asking]);
  const b = await person();
  const [, still] = await b.session([b.connect, b.between(b.landed), b.asking]);
  deepStrictEqual([codes(moved).includes('head/kept-changed'), a.reads(), codes(still).includes('head/reused'), b.reads()], [true, 2, true, 1], JSON.stringify([codes(moved), codes(still)]));
});

test('no: a read ahead that fails lands nothing — no receipt, no mark — and the question calls the source itself', async () => {
  const p = await person(() => 500);
  const [, answered] = await p.session([p.connect, p.between(() => new Promise((r) => setTimeout(r, 3000))), p.asking]);
  ok(!marked(p.place) && p.reads() === 2 && !codes(answered).includes('head/reused'), JSON.stringify([p.reads(), codes(answered)]));
});

test('no: an answer whose next is an act reads nothing ahead', async () => {
  const p = await person();
  await p.session([p.connect, p.between(p.landed), call('ask', { place: p.place, card: true }), p.between(() => new Promise((r) => setTimeout(r, 1500)))]);
  deepStrictEqual(p.reads(), 1, 'only the read the connect asked for');
});

test('the budget, by its numbers: of a rate of 10, reads ahead never take more than half of what questions leave, and a question is refused only past the whole rate', () => {
  const [family, at] = [valueOf(lock, 'receipt/family'), valueOf(lock, 'receipt/at')], now = Date.parse('2026-10-18T12:00:00.000Z'), when = new Date(now - 60_000).toISOString(), share = Number(valueOf(lock, 'ahead/share').split('..')[1]);
  const reads = (n: number, ahead: number) => Array.from({ length: n }, (_, i) => [line(`${family}/forecast/get-forecast/k${i}`, 'digest', 'sha256:00', { at: `${at}:${when}` }), ...(i < ahead ? markOf({ ahead: 'true' }, [at, mark], `${family}/forecast/get-forecast/k${i}`, 'sha256:00', when) : [])]).flat();
  const over = (n: number, ahead: number, asked: Record<string, string>) => overOf(reads(n, ahead).map((l) => Object.fromEntries([...l.matchAll(/ (\w+)=("[^"]*"|\S+)/g)].map((m) => [m[1], m[2]!.replace(/^"|"$/g, '')]))), [family, at, mark], 'forecast', now, 10, share, asked);
  deepStrictEqual([over(0, 0, { ahead: 'true' }), over(4, 4, { ahead: 'true' }), over(5, 5, { ahead: 'true' }), over(5, 5, {}), over(9, 5, {}), over(10, 5, {})], [false, false, true, false, false, true]);
  deepStrictEqual(members(valueOf(lock, 'reading/apart')).length > 0, true);
});
