import { test } from 'node:test';
import { deepStrictEqual, ok, throws } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { newKey } from '../src/core/keys.ts';
import { members, valueOf } from '../src/core/lock.ts';
import { keychain } from '../src/ports/keychain.ts';
import { lock, root } from './place.ts';

/**
 * Stand-ins for each platform's own command, on PATH, each logging every argument list it was started with and keeping
 * what it is given in a folder: libsecret's secret-tool, and Windows PowerShell reading its program from stdin. They
 * check head's side of each command — what crosses argv and what crosses stdin — never the platform's own store.
 */
const standIns = () => {
  const dir = mkdtempSync(join(tmpdir(), 'head-stores-'));
  const node = (name: string, body: string) => { writeFileSync(join(dir, name), `#!/usr/bin/env node\n${body}`); chmodSync(join(dir, name), 0o755); };
  const common = `const fs = require('fs'), path = require('path'), dir = ${JSON.stringify(dir)}; fs.appendFileSync(path.join(dir, 'argv'), process.argv.slice(2).join(' ') + '\\n');
const held = (s, a) => path.join(dir, 'held-' + (s + '--' + a).replace(/\\//g, '_')); const input = fs.readFileSync(0, 'utf8');`;
  node('secret-tool', `${common}
const [verb, ...rest] = process.argv.slice(2); const at = (k) => rest[rest.indexOf(k) + 1];
if (verb === 'store') { fs.writeFileSync(held(at('service'), at('account')), input); process.exit(0); }
if (verb === 'lookup') { try { process.stdout.write(fs.readFileSync(held(at('service'), at('account')), 'utf8')); process.exit(0); } catch { process.exit(1); } }
process.exit(2);`);
  node('powershell.exe', `${common}
const said = (k) => (new RegExp('\\\\$' + k + " = '([^']*)'").exec(input) || [])[1];
if (input.includes('$v.Add(')) { fs.writeFileSync(held(said('r'), said('u')), Buffer.from(said('b'), 'base64').toString('utf8')); process.exit(0); }
if (input.includes('RetrievePassword')) { try { process.stdout.write(fs.readFileSync(held(said('r'), said('u')), 'utf8')); process.exit(0); } catch { process.exit(1); } }
process.exit(2);`);
  return { dir, argv: () => { try { return readFileSync(join(dir, 'argv'), 'utf8'); } catch { return ''; } } };
};

test('each platform keeps head-s keys in its own store through its own command, chosen by the lock-s line for the host: a key written is read back, an account never written reads none, a secret never crosses an argument, a name that is not one word is refused', () => {
  const fakes = standIns();
  process.env['PATH'] = `${fakes.dir}${delimiter}${process.env['PATH'] ?? ''}`;
  const kinds = ['linux', 'win32'].map((p) => lock.find((l) => l.scope === `platform/${p}/store`)!.value!);
  deepStrictEqual(kinds, ['secret-tool', 'credential-manager']);
  for (const kind of kinds) {
    const keys = keychain('@lapxo/head/home', kind), key = newKey();
    keys.write('place/shop/root', key.secret);
    deepStrictEqual([keys.read('place/shop/root'), keys.read('place/shop/none')], [key.secret, undefined], kind);
    ok(!fakes.argv().includes(key.secret), `${kind}: the secret crossed an argument`);
    throws(() => keys.write('place/shop root', key.secret), /REFUSE·keychain/);
  }
  throws(() => keychain('@lapxo/head/home', 'a-store-head-does-not-carry'), /REFUSE·keychain a-store-head-does-not-carry is no store head carries/);
  deepStrictEqual(['darwin', 'linux', 'win32'].map((p) => members(valueOf(lock, `platform/${p}/browser`))), [['open'], ['xdg-open'], ['rundll32', 'url.dll,FileProtocolHandler']], 'each opener a command and its arguments, in order, started without a shell');
});

test('the signer bound starts signs through the store its host-s line names: the same lot, the same key, the same signature, whichever store keeps it', () => {
  const fakes = standIns();
  const env = { ...process.env, PATH: `${fakes.dir}${delimiter}${process.env['PATH'] ?? ''}` };
  process.env['PATH'] = env.PATH;
  const key = newKey();
  const lot = 'bound-lock/1 at=policy:fixture by=root form=alphabet measure=id role=writes scope=keys/root value=authorize\n';
  const signed = ['secret-tool', 'credential-manager'].map((kind) => {
    keychain('@lapxo/head/home', kind).write('place/shop/root', key.secret);
    return execFileSync(process.execPath, [join(root, 'src/signer.ts'), '@lapxo/head/home', 'place/shop/root', 'root', 'ed25519:era1', kind], { input: lot, encoding: 'utf8', env });
  });
  ok(signed[0]!.includes('ed25519:era1:'), signed[0]);
  deepStrictEqual(signed[1], signed[0]);
  ok(!fakes.argv().includes(key.secret));
});
