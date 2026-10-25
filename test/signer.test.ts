import { test } from 'node:test';
import { deepStrictEqual, ok, throws } from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signedBytes, signerResponseOf } from '@lapxo/topos/wire';
import { valueOf } from '../src/core/lock.ts';
import { signingOf } from '../src/core/device.ts';
import { keychain, secretsOf } from '../src/ports/keychain.ts';
import { newKey } from '../src/ports/keys.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { api, born, lock, root, viewOf } from './place.ts';
import { offline } from './worlds.ts';
import { members } from '../src/core/lock.ts';

const signer = fileURLToPath(new URL('../src/signer.ts', import.meta.url));
const bytes = [signedBytes({ at: 'policy:t', by: 'head', form: 'alphabet', measure: 'digest', role: 'writes', scope: 'read/a', value: 'sha256:00' })];
const kind = valueOf(lock, `platform/${process.platform}/store`), service = '@lapxo/head/home';
const run = (args: readonly string[], env: Readonly<Record<string, string>>, input = '') => spawnSync(process.execPath, [signer, ...args], { input, encoding: 'utf8', env: { ...process.env, ...env } });
const ask1 = (env: Readonly<Record<string, string>>) => run(['@lapxo/head', 'head', 'head', 'ed25519:era1'], env, `${bytes.join('\n')}\n`);
/** A keychain account the fake logged, by the lock's names, with '/' as the fake writes it. */
const signingAccount = ((is) => (logged: string) => is(logged.replaceAll('_', '/')))(signingOf(lock));

test('the signer program answers a lot from the key the keychain holds, and nothing else crosses', () => {
  const got = ask1(fakeKeychain({ head: newKey().secret }).env);
  deepStrictEqual([got.status, signerResponseOf(got.stdout, { bytes, keyId: 'head', algorithm: 'ed25519:era1' }).length, got.stderr], [0, 1, '']);
});

test('with no key in the keychain the signer refuses and prints nothing', () => {
  const got = ask1(fakeKeychain({ head: undefined }).env);
  deepStrictEqual([got.status, got.stdout, got.stderr], [1, '', '']);
});

test('the signer makes a key once and says whether one is kept, printing its public half and never its secret', () => {
  const fake = fakeKeychain({});
  const [absent, made, again, held] = [run(['exists', service, 'head', kind], fake.env), run(['make', service, 'head', kind], fake.env), run(['make', service, 'head', kind], fake.env), run(['exists', service, 'head', kind], fake.env)];
  deepStrictEqual([absent.status, absent.stdout, made.status, again.stdout, held.stdout], [3, '', 0, made.stdout, made.stdout], 'made once, then the same public half');
  ok(fake.held('head', service) && !made.stdout.includes(fake.held('head', service)) && /^[A-Za-z0-9+/=]{40,}$/.test(made.stdout), 'a public half, never the secret');
});

test('the store head-s long process is handed refuses every signing account by name before any command starts; an access account is read as before; a key is made and its public half read by the signer alone', () => {
  const fake = fakeKeychain({ head: newKey().secret, person: newKey().secret, 'place/shop/root': newKey().secret });
  process.env['PATH'] = fake.env.PATH;
  const keys = keychain(service, kind, signingOf(lock)), before = fake.argv();
  for (const [account, key] of [[valueOf(lock, 'device/head/account'), 'device/head/account'], [valueOf(lock, 'device/person/account'), 'device/person/account'], ['place/shop/root', 'founding/root-account']] as const) {
    throws(() => keys.read(account), (e: Error) => e.message === `REFUSE·keychain ${key} names a signing key: only head's signer reads it`, 'named by the lock-s line, never by the account asked for');
    throws(() => keys.write(account, 'anything'), (e: Error) => e.message.startsWith(`REFUSE·keychain ${key} names a signing key`));
  }
  deepStrictEqual(fake.argv(), before, 'no keychain command started for a refused account');
  deepStrictEqual(keys.read('access/forecast'), undefined);
  ok(fake.argv().length > before.length, 'the control: an access account is read through the keychain command');
  const half = keys.held!('head');
  ok(half && !half.includes(fake.held('head')), 'the public half, from the signer');
  deepStrictEqual(fake.callers().filter((c) => signingAccount(c.account)).map((c) => c.by.includes(signer)), [true]);
});

test('by account name: founding a place, connecting a source and reading it, every read or write of a signing key is head-s signer-s, none head-s long process; a read from any other process is caught', async (t) => {
  const server = createServer((_, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"id":1}'); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-signing-'))];
    const fake = fakeKeychain({}), env = { ...fake.env, HEAD_HOME: home }, place = join(shared, 'mine'), yes = () => ({ action: 'accept', content: { yes: true } });
    writeFileSync(join(shared, 'weather.json'), JSON.stringify({ openapi: '3.0.3', info: { title: 'weather', version: '1' }, servers: [{ url: origin }], paths: { '/forecast': { get: { operationId: 'getForecast', security: [], responses: { 200: { description: 'ok' } } } } } }));
    const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
    await ask([tool('place', { dir: place })], [], env, yes);
    await ask([tool('connect', { place, source: 'weather', document: join(shared, 'weather.json') })], [shared], env, yes);
    const [read] = await ask([tool('look', { place, source: 'weather', operation: 'getForecast', at: '8' })], [], env, yes);
    ok((read.result.structuredContent.cells as { code: string }[]).some((c) => c.code === 'head/answered'), JSON.stringify(read.result).slice(0, 600));
    const signing = fake.callers().filter((c) => signingAccount(c.account));
    deepStrictEqual([...new Set(signing.map((c) => (/root$/.test(c.account) ? 'root' : c.account)))].sort(), ['head', 'person', 'root'], 'each kind of signing key was used');
    deepStrictEqual(signing.filter((c) => !c.by.includes(signer)), [], 'none read or written outside head-s signer');
    t.diagnostic(`MEASURED signing-key/callers · ${signing.length} keychain commands on signing accounts (${[...new Set(signing.map((c) => c.account))].map((a) => `${a} ${signing.filter((c) => c.account === a).length}`).join(' · ')}) · ${signing.filter((c) => c.by.includes(signer)).length} by head-s signer · ${fake.callers().length - signing.length} on other accounts`);
    process.env['PATH'] = fake.env.PATH;
    secretsOf(`${valueOf(lock, 'device/service')}/x`, kind).read('head');
    deepStrictEqual(fake.callers().filter((c) => signingAccount(c.account) && !c.by.includes(signer)).length, 1, 'the control: a read by another process is caught by its account');
  } finally { server.close(); }
});

/**
 * A door that reaches for a signing key, simulated with head's own code and a lock whose access account is head's device
 * key, so a read made the ordinary way asks the keychain for it: by MCP, by the lines door and by the http door, the same
 * cell names the key by the lock's line, each door writes the same refusal in the place's evidence by the request's
 * digest alone, and no keychain command ran for that account outside head's signer.
 */
test('a door that reaches for a signing key, by MCP, lines and http: the same named cell, the same refusal written, and the keychain never asked', async () => {
  const twin = mkdtempSync(join(tmpdir(), 'head-reaching-'));
  cpSync(join(root, 'src'), join(twin, 'src'), { recursive: true });
  cpSync(join(root, 'package.json'), join(twin, 'package.json'));
  symlinkSync(join(root, 'node_modules'), join(twin, 'node_modules'));
  writeFileSync(join(twin, 'TARGET.bound'), readFileSync(join(root, 'TARGET.bound'), 'utf8').replace(/( scope=access\/account value=)\S+/, `$1${valueOf(lock, 'device/head/account')}`));
  const entry = join(twin, 'src/index.ts'), [run, doors] = [valueOf(lock, 'cli/run'), members(valueOf(lock, 'cli/run/doors'))];
  const source = await api(() => '[{"number":1}]'), { place, keychain } = born(source.url), env = { ...process.env, ...offline(), ...keychain.env };
  const question = { place, source: 'tracker', operation: 'issues/list-for-repo', args: { owner: 'lapxo', repo: 'demo' } };
  const started = (door: string, input: string) => new Promise<string>((done) => { const child = spawn(process.execPath, [entry, run, door], { stdio: ['pipe', 'pipe', 'inherit'], env }); let out = ''; child.stdout.on('data', (c) => { out += c; }); child.once('exit', () => done(out)); child.stdin.end(input); });
  const card = (await ask([{ method: 'tools/call', params: { name: 'ask', arguments: { place, card: 'true' } } }], [], keychain.env))[0].result.structuredContent.cells.find((c: any) => c.code === 'head/card').fields.card;
  process.env['HEAD_ENTRY'] = entry;
  const [byMcp] = await ask([{ method: 'tools/call', params: { name: 'ask', arguments: question } }], [], keychain.env).finally(() => { delete process.env['HEAD_ENTRY']; });
  const byLines = JSON.parse((await started(doors[1]!, `${JSON.stringify({ id: 1, verb: 'ask', args: { ...question, card } })}\n`)).split('\n')[0]!);
  const byHttp = await new Promise<any>((done) => { const child = spawn(process.execPath, [entry, run, doors[2]!], { stdio: ['pipe', 'pipe', 'inherit'], env }); let out = '';
    child.stdout.on('data', (c) => { out += c; if (out.includes('\n') && !out.includes('"cells"')) { const { port } = JSON.parse(out.split('\n')[0]!), body = JSON.stringify({ ...question, card });
      request({ host: valueOf(lock, 'doors/loopback'), port, path: '/ask', method: 'POST', headers: { 'content-type': 'application/json' } }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { child.stdin.end(); child.once('exit', () => done(JSON.parse(b))); }); }).end(body); } }); });
  source.close();
  const refusedOf = (cells: any[]) => cells.filter((c) => c.code === 'head/signing-key-refused').map((c) => [c.state, c.fields.key]);
  deepStrictEqual([refusedOf(byMcp.result.structuredContent.cells), refusedOf(byLines.cells), refusedOf(byHttp.cells)], [[['refused', 'device/head/account']], [['refused', 'device/head/account']], [['refused', 'device/head/account']]], 'the same cell by every door, named by the lock-s line');
  const written = viewOf(place, 'evidence').split('\n').filter((l) => / scope=refused\/[0-9a-f]{16} /.test(l));
  deepStrictEqual([written.length, new Set(written.map((l) => / scope=(\S+) /.exec(l)![1])).size, written.every((l) => / about="ask head\/signing-key-refused" /.test(l))], [3, 1, true], 'one refusal a door, the same request digest, its about the verb and the code alone');
  deepStrictEqual(keychain.callers().filter((c) => c.account === valueOf(lock, 'device/head/account') && !c.by.includes(join(twin, 'src/signer.ts')) && !c.by.includes(signer)).map((c) => c.by), [], 'no keychain command for the device key but head-s signer-s');
});
