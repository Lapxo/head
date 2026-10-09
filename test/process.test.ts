import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { spawned } from '../src/ports/process.ts';

const node = (code: string, bounds: { wait?: number; most?: number; signal?: AbortSignal } = {}) =>
  spawned(process.execPath, ['-e', code], {}, { wait: bounds.wait ?? 0, most: bounds.most ?? 1_000_000, ...(bounds.signal ? { signal: bounds.signal } : {}) });
const gone = (pid: number): boolean => { try { process.kill(pid, 0); return false; } catch { return true; } };
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const forked = `const c = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); console.log(process.pid, c.pid); setInterval(() => {}, 1000);`;

test('a process head waits on never blocks it: a timer set meanwhile fires before the process ends', async () => {
  const fired: string[] = [];
  setTimeout(() => fired.push('timer'), 20);
  const got = await node('setTimeout(() => console.log("done"), 300)').then((p) => { fired.push('process'); return p; });
  deepStrictEqual([fired, got.code, got.out], [['timer', 'process'], 0, ['done']]);
});

test('no: a process that stalls is stopped when its wait runs out — its whole group, its cause said last, its exit no success', async () => {
  const got = await node(forked, { wait: 400 });
  const [pid, child] = got.out[0]!.split(' ').map(Number) as [number, number];
  await settle(100);
  deepStrictEqual([got.code, got.err.at(-1), gone(pid), gone(child)], [-1, 'waited 400 ms', true, true]);
});

test('no: a process that prints more than it may is stopped there — what came back is within the bound, never all of it', async () => {
  const got = await node('process.stdout.write("x".repeat(4_000_000)); setInterval(() => {}, 1000)', { most: 100_000, wait: 10_000 });
  deepStrictEqual([got.code, got.err.at(-1)], [-1, 'printed more than 100000 bytes']);
  ok(got.out.join('').length <= 100_000);
});

test('no: a process the asker cancels is stopped at once, its group with it, and nothing it would have printed is read as an answer', async () => {
  const asker = new AbortController();
  const running = node(`${forked} setTimeout(() => console.log('late'), 2000);`, { signal: asker.signal, wait: 10_000 });
  await settle(300);
  asker.abort();
  const got = await running;
  const [pid, child] = got.out[0]!.split(' ').map(Number) as [number, number];
  await settle(100);
  deepStrictEqual([got.code, got.err.at(-1), got.out.includes('late'), gone(pid), gone(child)], [-1, 'cancelled', false, true, true]);
  deepStrictEqual((await node('console.log(1)', { signal: AbortSignal.abort() })).err.at(-1), 'cancelled', 'cancelled before it starts is cancelled too');
});

test('no: a command that cannot start is an exit with its cause, never a throw', async () => {
  const got = await spawned('/nonexistent/command', [], {}, { wait: 1000, most: 1000 });
  deepStrictEqual([got.code, /ENOENT/.test(got.err.at(-1) ?? '')], [-1, true]);
});
