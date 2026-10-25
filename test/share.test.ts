import { test } from 'node:test';
import { deepStrictEqual, doesNotMatch, match, ok } from 'node:assert';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ask } from './client.ts';
import { tmpdir } from 'node:os';
import { valueOf } from '../src/core/lock.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { api, lock, said, text, viewOf } from './place.ts';
import { tool, auth, jobs, overlay, digestOf, pinsOf, yes, sender, receiver, receive } from './share-fixture.ts';

test('share packs a place into lines and the bytes they name, its pins resting on the issuer they read; another device connects the package by its digest on one yes, in that order, under its own root: the same pins, and nothing granted', async () => {
  const from = await sender();
  match(from.packed, said('shared'));
  const lines = readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8').trimEnd().split('\n');
  deepStrictEqual(digestOf(readFileSync(join(from.pkg, 'TARGET.bound'))), from.digest, 'the package is named by the digest of its lock');
  deepStrictEqual(lines.map((l) => / scope=(\S+)/.exec(l)![1]), ['uses/topos-openapi', 'sources/auth', 'uses/auth', 'sources/jobs', 'sources/jobs/overlay', 'uses/jobs'], 'auth comes first: jobs rests on the issuer auth declares');
  match(lines.find((l) => l.includes(' scope=uses/jobs '))!, / restsOn=uses\/auth /);
  for (const l of lines.filter((one) => / needs=/.test(one))) deepStrictEqual(digestOf(readFileSync(join(from.pkg, / needs=(\S+)/.exec(l)![1]!))), / value=(\S+)$/.exec(l)![1], 'every byte beside the lock hashes to its line');
  ok(lines.every((l) => / by=target /.test(l) && !/ sig=/.test(l) && / measure=digest /.test(l)), 'lines by digest, unsigned: the package is authenticated by its digest, sent apart');
  const [again] = await ask([tool('share', { place: from.place, to: from.pkg })], [from.shared], from.env);
  deepStrictEqual(/sha256:[0-9a-f]{64}/.exec(text(again))?.[0], from.digest, 'shared twice, the same bytes');

  const to = await receiver(), asked: string[] = [];
  const [got] = await receive(to, from.pkg, from.digest, asked, [from.shared]);
  match(text(got), said('received')); doesNotMatch(text(got), said('unresolved'));
  deepStrictEqual(asked.length, 1, 'one yes for all the package names'); match(asked[0]!, said('elicit-receive')); match(asked[0]!, /auth, jobs/);
  deepStrictEqual(pinsOf(to.place), pinsOf(from.place), 'compiled here, the same pins');
  const order = (scope: string) => Number(/ epoch=(\d+)/.exec(readFileSync(join(to.place, 'TARGET.bound'), 'utf8').split('\n').find((l) => l.includes(` scope=${scope} `))!)![1]);
  ok(order('uses/auth') < order('uses/jobs'), 'auth landed first');
  deepStrictEqual(readFileSync(join(to.place, 'connected', 'jobs.overlay.yaml'), 'utf8'), overlay);
  deepStrictEqual([/ scope=access\//.test(viewOf(to.place, 'evidence')), / scope=(allow\/origin|access)\//.test(viewOf(to.place, 'lines'))], [false, false], 'no access, no origin allowed: nothing the sharing place held');
});

test('the same place shares the same bytes twice; a change to one source changes only that source-s lines', async () => {
  const from = await sender(), linesAt = () => readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8').trimEnd().split('\n');
  const before = linesAt();
  const [again] = await ask([tool('share', { place: from.place, to: from.pkg })], [from.shared], from.env);
  deepStrictEqual([linesAt(), /sha256:[0-9a-f]{64}/.exec(text(again))?.[0]], [before, from.digest], 'shared twice, the same bytes and the same digest');
  writeFileSync(join(from.shared, 'jobs.json'), jobs.replace('"/jobs"', '"/jobs/all"'));
  await ask([tool('connect', { place: from.place, source: 'jobs', document: join(from.shared, 'jobs.json'), overlay: join(from.shared, 'jobs.overlay.yaml') })], [from.shared], from.env, yes([]));
  const [changed] = await ask([tool('share', { place: from.place, to: from.pkg })], [from.shared], from.env), after = linesAt();
  const scopeOf = (l: string) => / scope=(\S+)/.exec(l)![1]!, moved = before.filter((l) => !after.includes(l)).map(scopeOf).sort();
  deepStrictEqual(moved, ['sources/jobs', 'uses/jobs'], 'only the changed source-s document and pin');
  deepStrictEqual(after.map(scopeOf), before.map(scopeOf), 'in the same order');
  ok(/sha256:[0-9a-f]{64}/.exec(text(changed))?.[0] !== from.digest, 'and the package is named otherwise');
});

test('a package carries no byte a source answered: after the source answered a read, the package names only worlds, sources and pins, and no file of it holds the answer', async () => {
  let origin = '';
  const source = await api((url) => (url === '/openapi.json' ? JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: origin }], paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } } }) : '{"note":"answered-to-this-place-alone"}'));
  origin = source.url;
  const mine = mkdtempSync(join(tmpdir(), 'head-c10-')), env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine };
  const place = join(mine, valueOf(lock, 'first-run/folder')), to = join(place, 'package'), question = { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' } };
  const files = (at: string): string[] => readdirSync(at).flatMap((n) => (statSync(join(at, n)).isDirectory() ? files(join(at, n)) : [join(at, n)]));
  const [, , packed] = await ask([tool('connect', { ...question, document: `${origin}/openapi.json` } as never), { method: 'tools/call', params: { name: 'ask', arguments: { ...question, place } } }, { method: 'between', params: () => mkdirSync(to) }, tool('share', { place, to })], [], env, yes([])).finally(() => source.close());
  match(text(packed), said('shared'));
  ok(source.seen.some((one) => one.url?.startsWith('/forecast')), 'the source answered the read: there was an answer to leak');
  deepStrictEqual(readFileSync(join(to, 'TARGET.bound'), 'utf8').trimEnd().split('\n').map((l) => / scope=(\S+)/.exec(l)![1]!).filter((s) => !/^(uses|sources)\//.test(s)), []);
  deepStrictEqual(files(to).filter((f) => readFileSync(f, 'latin1').includes('answered-to-this-place-alone')), []);
});
