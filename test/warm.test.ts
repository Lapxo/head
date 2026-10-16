import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cooled, kept, warmed, warmth } from '../src/ports/warm.ts';
import { asked, bin, bounds, timeless, tree, twins } from './warm.ts';
import { root } from './place.ts';
import { fakeKeychain } from './fake-keychain.ts';

test('warm: the same asks of bound, with and without starting it — two places asked cold agree once their time is taken out, and the place asked warm agrees with them byte for byte, in what bound printed and in every file it left', async () => {
  Object.assign(warmth, { spares: 1, boot: ['NODE_', 'UV_'] });
  const { copies: [a, b, c], env, asks } = twins(3);
  try {
    for (const args of asks) {
      const [one, two, three] = [await asked('cold', a!, args, env), await asked('cold', b!, args, env), await asked('warm', c!, args, env)];
      const seen = (got: typeof one, at: string) => JSON.stringify([got.printed.code, got.printed.out.map((l) => timeless(l, at)), got.printed.err.map((l) => timeless(l, at))]);
      deepStrictEqual(seen(two, b!), seen(one, a!), `the control: two cold asks of ${args.join(' ')} differ in more than their time`);
      deepStrictEqual(seen(three, c!), seen(one, a!), `${args.join(' ')} asked warm`);
    }
    deepStrictEqual(tree(b!), tree(a!), 'the control: two cold places differ in more than their time');
    deepStrictEqual(tree(c!), tree(a!), 'the place asked warm');
  } finally { cooled(); }
});

test('warm, no: a process started under other values of the variables node reads as it starts is never asked, and the ask starts one of its own', async () => {
  Object.assign(warmth, { spares: 1, boot: ['NODE_'] });
  const { copies: [a], env } = twins(1);
  try {
    await kept(bin);
    deepStrictEqual(warmed(bin, ['fold', '--as', 'lines'], { cwd: a!, env: { ...env, NODE_PENDING_DEPRECATION: '1' } }, bounds), undefined);
  } finally { cooled(); }
});

test('warm, no: head keeps no process past the call it started it for — once a call is answered, head has no child left', async () => {
  const env = { ...process.env, ...fakeKeychain({}).env, HEAD_HOME: mkdtempSync(join(tmpdir(), 'head-warm-home-')) };
  const child = spawn(process.execPath, [process.env['HEAD_ENTRY'] || join(root, 'src/index.ts')], { stdio: ['pipe', 'pipe', 'inherit'], env });
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
