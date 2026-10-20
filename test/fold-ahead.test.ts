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

/** What bound leaves at each path a reading sets apart, as a real place holds it: its fold and its stamps are files, its locks a folder. */
type Shape = (path: string) => 'file' | 'dir';
const asBoundLeavesIt: Shape = (path) => (path.endsWith('.bound') ? 'file' : 'dir');
/** A place as bound leaves it: its lock, a ledger, and what a reading sets apart, each in the shape the place holds it. */
const placed = (shape: Shape = asBoundLeavesIt) => {
  const place = mkdtempSync(join(tmpdir(), 'head-ahead-'));
  writeFileSync(join(place, 'TARGET.bound'), 'bound-lock/1 at=policy:fixture by=target form=alphabet measure=id role=writes scope=a value=1\n');
  mkdirSync(join(place, '.bound/ledger'), { recursive: true });
  for (const path of members(valueOf(lock, 'reading/apart'))) shape(path) === 'dir' ? mkdirSync(join(place, path), { recursive: true }) : (mkdirSync(dirname(join(place, path)), { recursive: true }), writeFileSync(join(place, path), ''));
  writeFileSync(join(place, '.bound/ledger/owner.bound'), 'one\n');
  return place;
};
/** bound writing what a reading sets apart: a file rewritten, a folder written into. */
const rewrite = (place: string, path: string) => writeFileSync(asBoundLeavesIt(path) === 'dir' ? join(place, path, 'x') : join(place, path), String(Math.random()));

test('yes and no, over two places: a fold is kept for the conversation while the place reads the same, and folded again once its lock, its ledger, its environment or the reading of another place moves; what a reading sets apart moves nothing', async () => {
  const [a, b] = [placed(), placed()], count = new Map<string, number>();
  const fold = (place: string) => folded(lock, 'standing', place, async () => { count.set(place, (count.get(place) ?? 0) + 1); return { lines: [] }; });
  await fold(a); await fold(a); await fold(b);
  deepStrictEqual([count.get(a), count.get(b)], [1, 1], 'the same reading is folded once, and each place has its own');
  for (const apart of members(valueOf(lock, 'reading/apart'))) rewrite(a, apart);
  await fold(a);
  deepStrictEqual(count.get(a), 1, 'what only exists while bound runs, or is kept by its own digest, is no new reading');
  appendFileSync(join(a, '.bound/ledger/owner.bound'), 'evidence\n'); await fold(a);
  appendFileSync(join(a, 'TARGET.bound'), 'bound-lock/1 at=policy:fixture by=target form=alphabet measure=id role=writes scope=b value=1\n'); await fold(a);
  process.env[`${valueOf(lock, 'reading/environment')}AHEAD_TEST`] = '1'; await fold(a); await fold(b); delete process.env[`${valueOf(lock, 'reading/environment')}AHEAD_TEST`];
  deepStrictEqual([count.get(a), count.get(b)], [4, 2], 'new evidence, a new line or another environment is another reading');
});

/** The review-s two vectors, and the stamps a fold of evidence rewrites beside the store: the folds it took. */
const reviewed = async (place: string): Promise<number> => {
  let folds = 0;
  const fold = () => folded(lock, 'standing', place, async () => { folds += 1; return { lines: [] }; });
  mkdirSync(join(place, 'notes')); writeFileSync(join(place, 'notes', 'a'), 'bc'); await fold();
  rmSync(join(place, 'notes', 'a')); writeFileSync(join(place, 'notes', 'ab'), 'c'); await fold();
  deepStrictEqual(folds, 2, 'a and bc is not ab and c');
  writeFileSync(join(place, '.bound', 'cas', 'blob'), 'kept'); await fold();
  writeFileSync(join(place, '.bound', 'cas', 'blob'), 'altered'); await fold();
  deepStrictEqual(folds, 4, 'a blob that changed under its name is read by the fold, so it is another reading');
  writeFileSync(join(place, '.bound', 'cas', 'stamps.bound'), 'stamped again, by the fold of evidence'); await fold();
  deepStrictEqual(folds, 4, 'the stamps bound writes beside the store, rewritten by its own fold of evidence, are no new reading');
  return folds;
};

test('no, the review-s two vectors: a file whose name runs into its bytes, and a blob changed where the place keeps them by digest, are each another reading; the stamps bound rewrites beside them are not', async () => {
  deepStrictEqual(await reviewed(placed()), 4);
});

test('no, what bound writes as it reads moves nothing: its memo, its stamps and the receipts a closing carries are no new reading, each named in reading/apart; a new line of the lock is', async () => {
  const place = placed();
  let folds = 0;
  const fold = () => folded(lock, 'standing', place, async () => { folds += 1; return { lines: [] }; });
  await fold();
  for (const path of ['.bound/cas/memo', '.bound/cas/stamps.bound', '.bound/cas/carried', 'receipts.bound']) {
    ok(members(valueOf(lock, 'reading/apart')).includes(path), `${path} is named where the key reads what it sets apart`);
    rewrite(place, path); await fold();
  }
  deepStrictEqual(folds, 1, 'a read that changes nothing writes nothing into the key');
  appendFileSync(join(place, 'TARGET.bound'), 'bound-lock/1 at=policy:fixture by=target form=alphabet measure=id role=writes scope=c value=1\n'); await fold();
  deepStrictEqual(folds, 2, 'a new line of the lock is a new reading');
});

test('no, on a real place: a question read fresh and asked again after a pause folds nothing the second time, so bound-s fold beside the ledger is untouched by it; what bound writes as it reads, missing from reading/apart, would fold it again here', async () => {
  const server = createServer((q, r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(q.url === '/openapi.json' ? JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: origin }], paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } } }) : JSON.stringify({ city: new URL(q.url ?? '/', origin).searchParams.get('city'), temperature: 21 })); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, mine = mkdtempSync(join(tmpdir(), 'head-real-'));
  const env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine }, place = join(mine, valueOf(lock, 'first-run/folder'));
  const question = { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' } }, fold = join(place, '.bound', 'ledger', 'fold.bound');
  const sum = () => createHash('sha256').update(readFileSync(fold)).digest('hex'), pause = Number(valueOf(lock, 'onboarding/pause').split('..')[1]);
  /** What the place holds outside what a reading sets apart, so a failure names what moved. */
  const apart = members(valueOf(lock, 'reading/apart'));
  const snapshot = (): Map<string, string> => new Map(readdirSync(place, { recursive: true }).map(String).filter((f) => !apart.some((a) => f === a || f.startsWith(`${a}/`)) && statSync(join(place, f)).isFile()).map((f) => [f, createHash('sha256').update(readFileSync(join(place, f))).digest('hex')]));
  /** The fold beside the ledger once head's queue has settled: unchanged for three seconds, so a refold of the question before is not taken for the repeat. */
  const settled = async (): Promise<string> => { let [last, since] = [sum(), Date.now()]; while (Date.now() - since < 3000) { await new Promise((r) => setTimeout(r, 250)); const now = sum(); if (now !== last) [last, since] = [now, Date.now()]; } return last; };
  let [before, held] = ['', new Map<string, string>()];
  try {
    const fresh = { ...question, args: { city: 'quito' } };
    const answers = await ask([call('connect', { ...question, document: `${origin}/openapi.json` }), call('ask', { ...fresh, place }),
      { method: 'between', params: async () => { await new Promise((r) => setTimeout(r, pause)); before = await settled(); held = snapshot(); } }, call('ask', { ...fresh, place })], [], env, () => ({ action: 'accept', content: { yes: true } }));
    ok(answers.at(-1).result.structuredContent.cells.some((c: any) => c.code === 'head/kept'), 'the question asked again is answered from what was kept');
    deepStrictEqual(sum(), before, `the question asked again, and the refold after it, folded nothing: the place read the same as when it was last folded; what moved besides what a reading sets apart: ${((now) => [...new Set([...held.keys(), ...now.keys()])].filter((f) => held.get(f) !== now.get(f)).join(', ') || 'nothing')(snapshot())}`);
  } finally { server.close(); }
});

test('no, the fixture is the place: where a real place holds a file, a fixture that holds a folder fails the vector, so it cannot pass against what does not exist', async () => {
  await rejects(reviewed(placed(() => 'dir')));
});

test('head-s own key of a reading decides only whether to fold again: the fold cache alone reads it, and it never leaves the process', () => {
  const src = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? src(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
  const readers = src('src').filter((f) => /from '[./]*ports\/reading\.ts'/.test(readFileSync(f, 'utf8')));
  deepStrictEqual(readers, [join('src', 'ahead', 'fold.ts')], 'one reader of the key: the cache that decides whether to fold again');
  deepStrictEqual([...readFileSync(join('src', 'ahead', 'fold.ts'), 'utf8').matchAll(/^export const (\w+)/gm)].map((m) => m[1]), ['folded'], 'what the cache keeps it keeps to itself: only the fold goes out, never the key');
});

test('no: a fold that failed is not kept — the next one folds again', async () => {
  const place = placed();
  let tries = 0;
  const fold = () => folded(lock, 'policy', place, async () => { tries += 1; if (tries === 1) throw Error('bound failed'); return { lines: [] }; });
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
