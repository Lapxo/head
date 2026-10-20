import { test } from 'node:test';
import { deepStrictEqual, ok, rejects } from 'node:assert';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { folded } from '../src/ahead/fold.ts';
import { aboutOf, members, valueOf } from '../src/core/lock.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { lock } from './place.ts';

const call = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });

test('the instrument identity alone controls reuse, separately for each view and place', async () => {
  let identity = 'first', calls = 0;
  const place = mkdtempSync(join(tmpdir(), 'head-identity-'));
  const read = (view: string, at = place) => folded(view, at, async () => identity, async (expected) => { calls += 1; return { lines: [expected!] }; });
  await read('lines'); await read('lines'); await read('evidence'); await read('lines', place + '-other');
  deepStrictEqual(calls, 3);
  identity = 'selected-receipt-changed'; await read('lines');
  deepStrictEqual(calls, 4, 'selected evidence is verified by bound, never excluded by head');
});

test('an unavailable identity or a refused expected snapshot never validates a cached answer', async () => {
  const place = mkdtempSync(join(tmpdir(), 'head-identity-refusal-'));
  let identity: string | undefined = 'one', calls = 0, refuse = false;
  const read = () => folded('lines', place, async () => identity, async () => { calls += 1; return refuse ? { refused: 'reading-identity/context' } : { lines: [] }; });
  await read(); identity = undefined; await read(); await read();
  deepStrictEqual(calls, 3, 'unsupported or unbudgeted places are read fresh');
  identity = 'changed'; refuse = true; await read(); await read();
  deepStrictEqual(calls, 5, 'refusal is not retained as a successful projection');
});

test('no, on a real place: a question read fresh and asked again after a pause folds nothing the second time, so bound-s fold beside the ledger is untouched by it; native identity excludes the fold journal from semantic inputs', async () => {
  const server = createServer((q, r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(q.url === '/openapi.json' ? JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: origin }], paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } } }) : JSON.stringify({ city: new URL(q.url ?? '/', origin).searchParams.get('city'), temperature: 21 })); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, mine = mkdtempSync(join(tmpdir(), 'head-real-'));
  const env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine }, place = join(mine, valueOf(lock, 'first-run/folder'));
  const question = { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' } }, fold = join(place, '.bound', 'ledger', 'fold.bound');
  const sum = () => createHash('sha256').update(readFileSync(fold)).digest('hex'), pause = Number(valueOf(lock, 'onboarding/pause').split('..')[1]);
  /** Diagnostic file changes never determine the cache identity. */
  const snapshot = (): Map<string, string> => new Map(readdirSync(place, { recursive: true }).map(String).filter((f) => statSync(join(place, f)).isFile()).map((f) => [f, createHash('sha256').update(readFileSync(join(place, f))).digest('hex')]));
  /** The fold beside the ledger once head's queue has settled: unchanged for three seconds, so a refold of the question before is not taken for the repeat. */
  const settled = async (): Promise<string> => { let [last, since] = [sum(), Date.now()]; while (Date.now() - since < 3000) { await new Promise((r) => setTimeout(r, 250)); const now = sum(); if (now !== last) [last, since] = [now, Date.now()]; } return last; };
  let [before, held] = ['', new Map<string, string>()];
  try {
    const fresh = { ...question, args: { city: 'quito' } };
    const answers = await ask([call('connect', { ...question, document: `${origin}/openapi.json` }), call('ask', { ...fresh, place }),
      { method: 'between', params: async () => { await new Promise((r) => setTimeout(r, pause)); before = await settled(); held = snapshot(); } }, call('ask', { ...fresh, place })], [], env, () => ({ action: 'accept', content: { yes: true } }));
    ok(answers.at(-1).result.structuredContent.cells.some((c: any) => c.code === 'head/kept'), 'the question asked again is answered from what was kept');
    deepStrictEqual(sum(), before, `the question asked again, and the refold after it, folded nothing: the place read the same as when it was last folded; diagnostic file changes: ${((now) => [...new Set([...held.keys(), ...now.keys()])].filter((f) => held.get(f) !== now.get(f)).join(', ') || 'nothing')(snapshot())}`);
  } finally { server.close(); }
});

test('only the bound port decodes reading identities; head has no filesystem identity implementation', () => {
  const reading = readFileSync(join('src', 'ports', 'reading.ts'), 'utf8');
  ok(!/node:(fs|crypto)|reading\/apart|reading\/environment/.test(reading));
  ok(readFileSync(join('src', 'ports', 'bound.ts'), 'utf8').includes('readingOf'));
});

test('no: a fold that failed is not kept — the next one folds again', async () => {
  const place = mkdtempSync(join(tmpdir(), 'head-failed-'));
  let tries = 0;
  const fold = () => folded('policy', place, async () => 'same', async () => { tries += 1; if (tries === 1) throw Error('bound failed'); return { lines: [] }; });
  await fold().catch(() => undefined); await fold();
  deepStrictEqual(tries, 2);
});

test('the client is told what to show a person: no coordinate, digest, pin or ledger epoch, but where they ask why or share a place', async () => {
  const answers = await ask([{ method: 'tools/list' }], [], { ...fakeKeychain({}).env, HEAD_HOME: mkdtempSync(join(tmpdir(), 'head-home-')) });
  deepStrictEqual((answers as any).initialized.result.instructions, aboutOf(lock, 'prose/en/instructions'));
  ok(/digest/.test(aboutOf(lock, 'prose/en/instructions')) && /why/.test(aboutOf(lock, 'prose/en/instructions')));
  ok(/claim only with the person-s exact words, never with a conclusion of yours/.test(aboutOf(lock, 'prose/en/instructions')), 'and that claim carries only the person-s own words');
});

/** The sentences of a text a person reads that ask to show them a structural number: show, tell or give, with no never. */
const asksToShow = (text: string): readonly string[] => text.split(/(?<=[.:;])\s+/).filter((s) => /\b(show|tell|give)\b/i.test(s) && !/\bnever\b/i.test(s) && /\b(digests?|pins?|pinned|epochs?|coordinates?)\b/i.test(s));

test('person-words, widened: no text a person reads — a prompt, the welcome, the instructions — asks to show a structural number, but the forms the lock declares', () => {
  const shown = members(valueOf(lock, 'person-words/shown'));
  const texts = lock.filter((l) => /^prompt\/[^/]+\/text$/.test(l.scope ?? '') || l.scope === 'prose/en/instructions').map((l) => ({ form: l.scope!.split('/')[1]!, asks: asksToShow(l.about ?? '') }));
  deepStrictEqual(texts.filter((t) => t.asks.length && !shown.includes(t.form)).map((t) => t.form), []);
  deepStrictEqual(asksToShow('Read it, then show me the card digest and its pin.'), ['Read it, then show me the card digest and its pin.'], 'a prompt that asks to show one is seen');
  ok(texts.some((t) => t.form === 'share' && t.asks.length), 'share asks to show the digest it shares, as the lock declares it may');
});
