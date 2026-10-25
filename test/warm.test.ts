import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cooled, hosted, hosting, hostOf } from '../src/ports/host.ts';
import { asked, bin, timeless, tree, twins } from './warm.ts';
import { lock, root } from './place.ts';
import { aboutOf, valueOf } from '../src/core/lock.ts';
import { fakeKeychain } from './fake-keychain.ts';

const seen = (got: Awaited<ReturnType<typeof asked>>, at: string) => JSON.stringify([got.printed.code, got.printed.out.map((l) => timeless(l, at)), got.printed.err.map((l) => timeless(l, at))]);
const alive = (pid: number | undefined) => { try { return pid !== undefined && process.kill(pid, 0); } catch { return false; } };
const lines = ['fold', '--as', 'lines'];

test('host: the same asks of bound, by a process started as asked and through a place-s fold host — two places asked cold agree once their time is taken out, and the place read through its host agrees with them byte for byte, in what bound printed and in what it left; read again through the host it started and through a fresh one, the same', async () => {
  const { copies: [a, b, c], env, asks } = twins(3);
  try {
    for (const args of asks) {
      const [one, two, three] = [await asked('cold', a!, args, env), await asked('cold', b!, args, env), await asked('warm', c!, args, env)];
      deepStrictEqual(seen(two, b!), seen(one, a!), `the control: two cold asks of ${args.join(' ')} differ in more than their time`);
      deepStrictEqual(seen(three, c!), seen(one, a!), `${args.join(' ')} through the host`);
    }
    deepStrictEqual(tree(b!), tree(a!), 'the control: two cold places differ in more than their time');
    deepStrictEqual(tree(c!), tree(a!), 'the place read through its host');
    const first = await asked('warm', c!, lines, env), pid = hostOf(c!), again = await asked('warm', c!, lines, env);
    deepStrictEqual([hostOf(c!), seen(again, c!)], [pid, seen(first, c!)], 'read again through the host it started');
    cooled();
    const fresh = await asked('warm', c!, lines, env);
    ok(hostOf(c!) !== undefined && hostOf(c!) !== pid, 'a fresh host');
    deepStrictEqual(seen(fresh, c!), seen(first, c!), 'through a fresh host, the same bytes');
  } finally { cooled(); }
});

test('host, no: a refusal closes the place-s host, and the next read starts another', async () => {
  const { copies: [a], env } = twins(1);
  try {
    await asked('warm', a!, lines, env);
    const pid = hostOf(a!), refused = await asked('warm', a!, ['fold', '--as', 'no-such-view'], env);
    deepStrictEqual([refused.printed.code !== 0, hostOf(a!)], [true, undefined], 'the refusal closed it');
    await asked('warm', a!, lines, env);
    ok(hostOf(a!) !== undefined && hostOf(a!) !== pid, 'the next read started another');
  } finally { cooled(); }
});

test('host, no: an installed bound changed after its host started is refused by name and its host closed; a bound that is not the pinned instrument never starts one', async () => {
  const { copies: [a], env } = twins(1), from = join(mkdtempSync(join(tmpdir(), 'head-instrument-')), 'bound');
  cpSync(dirname(dirname(dirname(bin))), from, { recursive: true });
  try {
    deepStrictEqual((await hosted(a!, lines, undefined, from)).code, 0, 'the same bytes are the pinned instrument');
    appendFileSync(join(from, 'README.md'), '\n');
    const changed = await hosted(a!, lines, undefined, from);
    deepStrictEqual([changed.code, /^REFUSE·host the installed bound changed after its host started/.test(changed.err[0] ?? ''), hostOf(a!)], [-1, true, undefined]);
    const other = await hosted(a!, lines, undefined, from);
    deepStrictEqual([other.code, other.err, hostOf(a!)], [-1, ['REFUSE·host/instrument-pin'], undefined], 'a bound whose bytes are not the pin starts no host');
  } finally { cooled(); }
});

test('host: idle for its idle, a place-s host is closed, its process gone and its scratch removed', async () => {
  const { copies: [a], env } = twins(1), scratch = mkdtempSync(join(tmpdir(), 'head-host-scratch-')), [was, idle] = [process.env['TMPDIR'], hosting.idle];
  Object.assign(process.env, { TMPDIR: scratch }); hosting.idle = 0.2;
  try {
    await asked('warm', a!, lines, env);
    const pid = hostOf(a!);
    deepStrictEqual([alive(pid), readdirSync(scratch).length > 0], [true, true], 'held, with its scratch');
    for (let i = 0; i < 40 && (hostOf(a!) !== undefined || alive(pid) || readdirSync(scratch).length); i += 1) await new Promise((done) => setTimeout(done, 50));
    deepStrictEqual([hostOf(a!), alive(pid), readdirSync(scratch)], [undefined, false, []]);
  } finally { hosting.idle = idle; if (was === undefined) delete process.env['TMPDIR']; else process.env['TMPDIR'] = was; cooled(); rmSync(scratch, { recursive: true, force: true }); }
});

test('host, no: a call that reads no place leaves no process behind — once it is answered, head has no child left', async () => {
  const env = { ...process.env, ...fakeKeychain({}).env, HEAD_HOME: mkdtempSync(join(tmpdir(), 'head-warm-home-')) };
  const child = spawn(process.execPath, [process.env['HEAD_ENTRY'] || join(root, 'src/index.ts'), valueOf(lock, 'cli/run')], { stdio: ['pipe', 'pipe', 'inherit'], env });
  const answers: unknown[] = [];
  let buffer = '';
  child.stdout.on('data', (chunk) => { buffer += chunk; for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) { answers.push(JSON.parse(buffer.slice(0, at))); buffer = buffer.slice(at + 1); } });
  const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const until = async (n: number) => { while (answers.length < n) await new Promise((done) => child.stdout.once('data', done)); };
  const children = () => { try { return execFileSync('pgrep', ['-P', String(child.pid)], { encoding: 'utf8' }).split('\n').filter(Boolean); } catch { return []; } };
  try {
    send({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    await until(1);
    send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'places', arguments: {} } });
    await until(2);
    for (let i = 0; i < 40 && children().length; i += 1) await new Promise((done) => setTimeout(done, 50));
    ok(answers.length === 2, 'the call was answered');
    deepStrictEqual(children(), []);
  } finally { child.kill(); }
});

test('head with nothing starts nothing: it says what a person can do and that a client starts it with run, and ends', () => {
  const said = execFileSync(process.execPath, [join(root, 'src/index.ts')], { encoding: 'utf8', timeout: 20_000 });
  deepStrictEqual(said.trim(), aboutOf(lock, 'cli/help'));
  ok(['connect', 'ask', 'do', 'share', valueOf(lock, 'cli/run')].every((word) => said.includes(word)), said);
});
