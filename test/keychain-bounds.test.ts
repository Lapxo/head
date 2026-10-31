import { test } from 'node:test';
import { ok, rejects, deepStrictEqual } from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { keychain } from '../src/ports/keychain.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { newKey } from '../src/ports/keys.ts';

const withPath = async (path: string, act: () => Promise<void>) => { const before = process.env.PATH; process.env.PATH = path; try { await act(); } finally { process.env.PATH = before; } };
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('cancellation stops the signer and its hanging keychain child before returning', async () => {
  const fake = fakeKeychain({}), dir = fake.env.PATH.split(':')[0]!, pidFile = join(dir, 'hanging-pid');
  writeFileSync(join(dir, 'security'), `#!/bin/sh\necho $$ > '${pidFile}'\nexec /bin/sleep 30\n`); chmodSync(join(dir, 'security'), 0o755);
  await withPath(fake.env.PATH, async () => {
    const abort = new AbortController(), keys = keychain('cancel', 'keychain', () => undefined, { wait: 10000, most: 1024, signal: abort.signal });
    const pending = Promise.resolve(keys.held!('device')); const refused = rejects(pending, /signer\/cancelled/);
    const until = Date.now() + 5000; while (!existsSync(pidFile) && Date.now() < until) await pause(10);
    ok(existsSync(pidFile)); const pid = Number(readFileSync(pidFile, 'utf8')); ok(alive(pid)); abort.abort(); await refused;
    const reaped = Date.now() + 1000; while (alive(pid) && Date.now() < reaped) await pause(10); ok(!alive(pid), 'the keychain command does not outlive the request');
    deepStrictEqual(fake.held('device', 'cancel'), '');
  });
});

test('a public-key request is bounded by time and output, with no partial public result', async () => {
  const fake = fakeKeychain({ device: newKey().secret }), dir = fake.env.PATH.split(':')[0]!;
  await withPath(fake.env.PATH, async () => {
    await rejects(async () => keychain('bytes', 'keychain', () => undefined, { wait: 10000, most: 1 }).held!('device'), /signer\/output-budget/);
    writeFileSync(join(dir, 'security'), '#!/bin/sh\nexec /bin/sleep 30\n'); chmodSync(join(dir, 'security'), 0o755);
    const start = Date.now(); await rejects(async () => keychain('wait', 'keychain', () => undefined, { wait: 400, most: 1024 }).held!('device'), /signer\/timeout/); ok(Date.now() - start < 5000);
    await rejects(async () => keychain('invalid', 'keychain', () => undefined, { wait: 0, most: 1024 }).held!('device'), /signer\/budget/);
  });
});

test('signer launch reuses the native environment policy and does not execute inherited Node options', async () => {
  const fake = fakeKeychain({ device: newKey().secret }), dir = fake.env.PATH.split(':')[0]!, injected = join(dir, 'injected'), script = join(dir, 'injection.cjs');
  writeFileSync(script, `require('node:fs').writeFileSync(${JSON.stringify(injected)}, 'ran')`);
  const previous = process.env.NODE_OPTIONS, previousUV = process.env.UV_THREADPOOL_SIZE;
  process.env.NODE_OPTIONS = `--require=${script}`; process.env.UV_THREADPOOL_SIZE = '0';
  try { await withPath(fake.env.PATH, async () => { ok(await keychain('sanitized', 'keychain', () => undefined, { wait: 10000, most: 1024 }).held!('device')); }); ok(!existsSync(injected)); }
  finally { if (previous === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = previous; if (previousUV === undefined) delete process.env.UV_THREADPOOL_SIZE; else process.env.UV_THREADPOOL_SIZE = previousUV; }
});

test('an already cancelled public-key request never creates a key', async () => {
  const fake = fakeKeychain({}), abort = new AbortController(); abort.abort();
  await withPath(fake.env.PATH, async () => { await rejects(async () => keychain('before', 'keychain', () => undefined, { wait: 10000, most: 1024, signal: abort.signal }).made!('device'), /signer\/cancelled/); });
  deepStrictEqual(fake.held('device', 'before'), '');
});
