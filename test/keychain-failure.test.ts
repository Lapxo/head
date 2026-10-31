import { test } from 'node:test';
import { deepStrictEqual, ok, rejects } from 'node:assert/strict';
import { chmodSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fakeKeychain } from './fake-keychain.ts';
import { newKey } from '../src/ports/keys.ts';
import { store } from '../src/ports/stores/keychain.ts';
import { keychain } from '../src/ports/keychain.ts';

const signer = fileURLToPath(new URL('../src/signer.ts', import.meta.url));
test('an unavailable signing-key read never becomes absence or replaces a retained key', async () => {
  const service = 'read-failure', account = 'device', retained = newKey(), fake = fakeKeychain({});
  fake.put(account, retained.secret, service);
  const dir = fake.env.PATH.split(':')[0]!, command = join(dir, 'security');
  renameSync(command, join(dir, 'security-original'));
  writeFileSync(command, `#!/bin/sh\nif [ "$1" = find-generic-password ]; then exit 36; fi\nexec '${dir}/security-original' "$@"\n`);
  chmodSync(command, 0o755);
  for (const mode of ['make', 'exists']) {
    const got = spawnSync(process.execPath, [signer, mode, service, account, 'keychain'], { env: { ...process.env, ...fake.env }, encoding: 'utf8', timeout: 10000 });
    ok(got.status !== 0 && got.signal === null);
    deepStrictEqual(got.stdout, '');
    ok(got.stderr.includes('keychain/read-unavailable') && !got.stderr.includes(retained.secret));
    deepStrictEqual(fake.held(account, service), retained.secret);
    deepStrictEqual(fake.argv(), '', 'no write reaches the store after a failed read');
  }
  const before = process.env.PATH; process.env.PATH = fake.env.PATH;
  try { await rejects(async () => keychain(service, 'keychain', () => undefined, { wait: 10000, most: 1 << 20 }).made!(account), /keychain\/read-unavailable/); }
  finally { process.env.PATH = before; }
});

test('concurrent signer creation never overwrites the winner', async () => {
  const fake = fakeKeychain({});
  const run = () => new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [signer, 'make', 'concurrent', 'device', 'keychain'], { env: { ...process.env, ...fake.env }, timeout: 10000 });
    let out = '', err = ''; child.stdout.on('data', bytes => { out += bytes; }); child.stderr.on('data', bytes => { err += bytes; }); child.on('error', reject); child.on('close', code => resolve({ code, out, err })); child.stdin.end();
  });
  const results = await Promise.all([run(), run()]);
  ok(results.some(result => result.code === 0));
  const retained = spawnSync(process.execPath, [signer, 'exists', 'concurrent', 'device', 'keychain'], { env: { ...process.env, ...fake.env }, encoding: 'utf8', timeout: 10000 });
  deepStrictEqual(retained.status, 0);
  for (const result of results) {
    if (result.code === 0) deepStrictEqual([result.out, result.err], [retained.stdout, '']);
    else deepStrictEqual(result.out, '');
  }
});

test('a store without create-if-absent refuses key creation rather than using credential update', () => {
  const fake = fakeKeychain({});
  const got = spawnSync(process.execPath, [signer, 'make', 'unsupported-create', 'device', 'secret-tool'], { env: { ...process.env, ...fake.env }, encoding: 'utf8', timeout: 10000 });
  deepStrictEqual([got.status, got.stdout, got.stderr, fake.held('device', 'unsupported-create')], [4, '', 'keychain/create-unsupported\n', '']);
});

test('signing-key creation is create-if-absent while access credentials remain updateable', () => {
  const fake = fakeKeychain({}), previousPath = process.env.PATH;
  process.env.PATH = fake.env.PATH;
  try {
    const keys = store('creation'), first = newKey(), second = newKey();
    deepStrictEqual(keys.create!('device', first.secret), true);
    deepStrictEqual(keys.create!('device', second.secret), false);
    deepStrictEqual(keys.read('device'), first.secret);
    keys.write('access', 'one'); keys.write('access', 'two');
    deepStrictEqual(keys.read('access'), 'two');
  } finally { process.env.PATH = previousPath; }
});

test('only an established missing account permits make; retained keys remain stable', () => {
  const service = 'established-absence', fake = fakeKeychain({});
  const run = (mode: string) => spawnSync(process.execPath, [signer, mode, service, 'device', 'keychain'], { env: { ...process.env, ...fake.env }, encoding: 'utf8', timeout: 10000 });
  const absent = run('exists'), first = run('make'), repeated = run('make');
  deepStrictEqual([absent.status, absent.stdout, first.status, repeated.status, repeated.stdout], [3, '', 0, 0, first.stdout]);
  ok(first.stdout.length > 0 && !first.stdout.includes(fake.held('device', service)));
});
