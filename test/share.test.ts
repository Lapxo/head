import { test } from 'node:test';
import { deepStrictEqual, doesNotMatch, match, ok } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { said, text, viewOf } from './place.ts';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const op = (operationId: string, open = false) => ({ operationId, ...(open ? { security: [] } : {}), responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } } } });
const flow = { inputs: { properties: { email: { 'x-ask': 'form' } } }, outputs: { token: '$steps.login.outputs.token' }, 'x-attach': { in: 'header', name: 'Authorization', template: 'Bearer {token}' },
  steps: [{ stepId: 'login', operationId: 'login', requestBody: { payload: { email: '$inputs.email' } }, outputs: { token: '$response.body#/token' } }] };
const auth = JSON.stringify({ openapi: '3.0.3', info: { title: 'auth', version: '1' }, servers: [{ url: 'https://org.example' }], paths: { '/login': { post: op('login', true) } }, components: { 'x-access': { portal: flow } } });
const jobs = JSON.stringify({ openapi: '3.0.3', info: { title: 'jobs', version: '1' }, servers: [{ url: 'https://org.example' }], paths: { '/jobs': { get: op('list-jobs') } }, security: [{ BearerAuth: [] }],
  components: { securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer', 'x-access': { $ref: 'auth.json#/components/x-access/portal' } } } } });
const overlay = ['overlay: 1.0.0', 'info: { title: jobs described, version: "1" }', 'extends: jobs.json', 'actions:', '  - target: $.info', '    update:', '      description: the jobs of the org', ''].join('\n');
const digestOf = (bytes: string | Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const pinsOf = (dir: string) => readFileSync(join(dir, 'TARGET.bound'), 'utf8').split('\n').filter((l) => / scope=uses\/(auth|jobs) /.test(l)).map((l) => `${/ scope=(\S+)/.exec(l)![1]} ${/ value=(\S+)/.exec(l)![1]}`).sort();
const yes = (asked: string[]) => (params: any) => { asked.push(params.message); return { action: 'accept', content: { yes: true } }; };

/** A place of two sources, connected out of the order they rest in — jobs before the auth whose issuer it names, jobs with an overlay — packed by share into a folder the client shares. */
const sender = async () => {
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-share-'))];
  const env = { ...fakeKeychain({}).env, HEAD_HOME: home }, place = join(shared, 'org'), pkg = join(shared, 'package');
  writeFileSync(join(shared, 'auth.json'), auth); writeFileSync(join(shared, 'jobs.json'), jobs); writeFileSync(join(shared, 'jobs.overlay.yaml'), overlay);
  await ask([tool('place', { dir: place })], [], env, yes([]));
  await ask([tool('connect', { place, source: 'jobs', document: join(shared, 'jobs.json'), overlay: join(shared, 'jobs.overlay.yaml') })], [shared], env, yes([]));
  await ask([tool('connect', { place, source: 'auth', document: join(shared, 'auth.json') })], [shared], env, yes([]));
  const [packed] = await ask([tool('share', { place, to: pkg })], [shared], env);
  return { place, pkg, shared, env, packed: text(packed), digest: /sha256:[0-9a-f]{64}/.exec(text(packed).split('\n')[0]!)?.[0] ?? '' };
};
/** A place of its own, on another device: its own home, its own keychain, nothing connected. */
const receiver = async () => {
  const keychain = fakeKeychain({}), env = { ...keychain.env, HEAD_HOME: mkdtempSync(join(tmpdir(), 'head-home-')) }, place = join(mkdtempSync(join(tmpdir(), 'head-receive-')), 'mine');
  await ask([tool('place', { dir: place })], [], env, yes([]));
  return { place, env, keychain };
};
const receive = (to: { place: string; env: Record<string, string> }, pkg: string, digest: string, asked: string[], roots: readonly string[]) => ask([tool('connect', { place: to.place, document: join(pkg, 'TARGET.bound'), digest })], roots, to.env, yes(asked));
/** A package re-said: its lock rewritten by a change, and the digest it is then named by. */
const resaid = (pkg: string, change: (lines: string[]) => string[]) => { const lock = `${change(readFileSync(join(pkg, 'TARGET.bound'), 'utf8').trimEnd().split('\n')).join('\n')}\n`; writeFileSync(join(pkg, 'TARGET.bound'), lock); return digestOf(lock); };

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

test('no: a package is refused by name before anything is asked when its digest, a line no package carries, the world it was compiled under or the order its pins rest in is not as the package says — and nothing lands', async () => {
  const from = await sender(), to = await receiver(), before = readFileSync(join(to.place, 'TARGET.bound'), 'utf8');
  const refused = async (digest: string, name: string, also?: RegExp) => { const asked: string[] = []; const [got] = await receive(to, from.pkg, digest, asked, [from.shared]);
    match(text(got), said(name)); if (also) match(text(got), also); deepStrictEqual([asked, readFileSync(join(to.place, 'TARGET.bound'), 'utf8')], [[], before]); };
  await refused(digestOf('another package'), 'document-digest');
  const kept = readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8');
  await refused(resaid(from.pkg, (ls) => [...ls, ls[0]!.replace('scope=uses/topos-openapi', 'scope=allow/origin/org').replace(/value=\S+$/, 'value=https://org.example')]), 'package-line', /allow\/origin\/org/);
  writeFileSync(join(from.pkg, 'TARGET.bound'), kept);
  await refused(resaid(from.pkg, (ls) => ls.map((l) => (l.includes('scope=uses/topos-openapi') ? l.replace(/value=\S+$/, `value=${digestOf('another world')}`) : l))), 'package-world');
  writeFileSync(join(from.pkg, 'TARGET.bound'), kept);
  await refused(resaid(from.pkg, (ls) => ls.map((l) => l.replace('restsOn=uses/auth', 'restsOn=uses/payroll'))), 'package-line', /restsOn/);
  writeFileSync(join(from.pkg, 'TARGET.bound'), kept);
  ok(!existsSync(join(to.place, 'connected')), 'no byte was laid');
});

test('no: a pin the package names that this head does not compile is refused by name once every source is connected; and share writes only into a folder apart from what a place keeps', async () => {
  const from = await sender(), to = await receiver(), asked: string[] = [];
  const line = readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8').split('\n').find((l) => l.includes(' scope=uses/jobs '))!, compiled = join(from.pkg, / needs=(\S+)/.exec(line)![1]!);
  writeFileSync(compiled, `${readFileSync(compiled, 'utf8')}bound-lock/1 at=place:openapi form=alphabet measure=class role=writes scope=offers/jobs/delete-everything value=callable\n`);
  const other = digestOf(readFileSync(compiled));
  const [got] = await receive(to, from.pkg, resaid(from.pkg, (ls) => ls.map((l) => (l === line ? l.replace(/value=\S+$/, `value=${other}`) : l))), asked, [from.shared]);
  match(text(got), said('package-pin')); match(text(got), new RegExp(`jobs compiled here as sha256:[0-9a-f]{64}, not as the ${other}`)); doesNotMatch(text(got), said('received'));
  deepStrictEqual(asked.length, 1);
  for (const at of [from.place, join(from.place, 'connected'), join(from.place, '.head', 'out'), from.shared]) {
    const [refused] = await ask([tool('share', { place: from.place, to: at })], [from.shared], from.env);
    match(text(refused), said('share-to'));
  }
});

/** Encrypted addresses as a bucket hands them out, here on this device: each object behind its own signed address, every other one moved first; every request kept with what it carried. */
const bucket = async (objects: Map<string, string>) => {
  const seen: { url: string; authorization: string }[] = [];
  const server = createServer((request, response) => { const url = request.url ?? ''; seen.push({ url, authorization: String(request.headers['authorization'] ?? '') });
    const [path, n] = [url.split('?')[0]!, Number(/^\/signed\/(\d+)/.exec(url)?.[1] ?? -1)];
    if (n >= 0 && n % 2 === 1) { response.writeHead(302, { location: `/blob/${n}` }); response.end(); return; }
    const body = objects.get(n >= 0 ? `/blob/${n}` : path); response.writeHead(body === undefined ? 404 : 200); response.end(body ?? ''); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) };
};

test('one address, one yes: a package published at signed addresses — each byte at its own, half of them moved — is received from its lock-s address by its digest, every read with nothing attached and every byte held to its digest; a byte that hashes otherwise is refused by name before anything is asked', async () => {
  const from = await sender(), objects = new Map<string, string>(), store = await bucket(objects);
  try {
    const paths = readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8').trimEnd().split('\n').flatMap((l) => / needs=(\S+)/.exec(l)?.[1] ?? []);
    paths.forEach((p, n) => objects.set(`/blob/${n}`, readFileSync(join(from.pkg, p), 'utf8')));
    const [resaid] = await ask([tool('share', { place: from.place, to: from.pkg, urls: JSON.stringify(Object.fromEntries(paths.map((p, n) => [p, `${store.url}/signed/${n}?sig=s${n}&expires=2999`]))) })], [from.shared], from.env);
    const lock = readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8'), digest = /sha256:[0-9a-f]{64}/.exec(text(resaid).split('\n')[0]!)![0];
    deepStrictEqual([digestOf(lock), lock.split('\n').filter((l) => / measure=id /.test(l)).length], [digest, paths.length], 'beside every digest that names bytes, the address they are read at');
    objects.set('/pkg/TARGET.bound', lock);
    const to = await receiver(), asked: string[] = [], at = `${store.url}/pkg/TARGET.bound?sig=lock&expires=2999`;
    const [got] = await ask([tool('connect', { place: to.place, document: at, digest })], [], to.env, yes(asked));
    match(text(got), said('received')); deepStrictEqual([asked.length, pinsOf(to.place)], [1, pinsOf(from.place)]);
    deepStrictEqual(store.seen.filter((r) => r.authorization).length, 0, 'nothing attached to any read');
    ok(store.seen.some((r) => r.url.startsWith('/blob/')), 'moved addresses followed, to the bytes their digest names');
    const other = await receiver(), one: string[] = [];
    objects.set(`/blob/${paths.indexOf('connected/jobs.json')}`, jobs.replace('list-jobs', 'list-everything'));
    const [opened] = await ask([tool('connect', { place: other.place, document: at, digest })], [], other.env, yes(one));
    match(text(opened), said('received-open')); match(text(opened), /\/signed\/\d+\?sig=/); deepStrictEqual([one.length, pinsOf(other.place)], [1, pinsOf(from.place).filter((p) => p.startsWith('uses/auth '))], 'a byte that hashes otherwise is not used: its source waits, the rest arrives');
  } finally { await store.close(); }
});

test('absence is not a refusal: a source whose bytes did not arrive, or hash otherwise, waits, with every source resting on it, as a demand the place holds naming them; the rest arrives on one yes; brought later, the same package connects it and the demand is paid', async () => {
  const from = await sender(), to = await receiver(), asked: string[] = [], jobsAt = join(from.pkg, 'connected', 'jobs.json'), jobsDigest = digestOf(jobs);
  writeFileSync(jobsAt, jobs.replace('list-jobs', 'list-everything'));
  const [first] = await receive(to, from.pkg, from.digest, asked, [from.shared]);
  match(text(first), said('received')); match(text(first), said('received-open')); match(text(first), new RegExp(`${jobsDigest} at \\S+connected/jobs\\.json`));
  deepStrictEqual([asked.length, pinsOf(to.place)], [1, pinsOf(from.place).filter((p) => p.startsWith('uses/auth '))], 'auth arrived; jobs, whose bytes hash otherwise, did not');
  const owed = () => readFileSync(join(to.place, 'TARGET.bound'), 'utf8').split('\n').filter((l) => / scope=needs\/bytes\/jobs /.test(l) && / role=demands /.test(l));
  ok(owed().some((l) => l.endsWith(`value=${jobsDigest}`)), 'the place holds the demand, naming the bytes it waits on');
  writeFileSync(jobsAt, jobs);
  const [second] = await receive(to, from.pkg, from.digest, asked, [from.shared]);
  match(text(second), said('received')); doesNotMatch(text(second), said('received-open'));
  deepStrictEqual(pinsOf(to.place), pinsOf(from.place), 'brought, the same pins');
  ok(owed().some((l) => l.endsWith('value=withdraw')), 'the demand is paid by its withdraw');

  const blocked = await receiver(), authAt = join(from.pkg, 'connected', 'auth.json');
  writeFileSync(authAt, auth.replace('login', 'logout'));
  const [neither] = await receive(blocked, from.pkg, from.digest, [], [from.shared]);
  doesNotMatch(text(neither), said('received')); match(text(neither), /jobs waits on bytes[^\n]*: auth\./);
  deepStrictEqual(pinsOf(blocked.place), [], 'a source resting on one that waits waits too');
  writeFileSync(authAt, auth);
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
