import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { lock, root } from './place.ts';
import { members, valueOf } from '../src/core/lock.ts';

type File = { readonly path: string; readonly bytes: Uint8Array };
const patterns: Readonly<Record<string, RegExp>> = {
  'literal/key': /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_\w{40,}|\bnpm_[A-Za-z0-9]{30,}|\bAKIA[0-9A-Z]{16}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}|\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.|\bsk-[A-Za-z0-9]{20,}/g,
  'literal/path': /\/Users\/[^/\s"'`]+|\/home\/[^/\s"'`]+\/|\/Volumes\/|[A-Z]:\\\\Users\\\\|\/private\/var\/folders\//g,
};
/**
 * The reader of the lock's literal ceilings, over what a pack carries — the package, the lock, its receipts and the source
 * the package is built from: keys and tokens, one machine's paths, hosts beyond loopback and the lock's own sources,
 * private organisations named in a list kept outside the repository, and a world's bytes in the package. Counts by name.
 */
export const scan = (carried: readonly File[], packed: readonly File[], hosts: ReadonlySet<string>, words: readonly string[], worlds: ReadonlySet<string>) => {
  const found: Record<string, string[]> = { 'literal/key': [], 'literal/path': [], 'literal/host': [], 'literal/org': [], 'package/world-bytes': [] };
  for (const { path, bytes } of carried) {
    const text = Buffer.from(bytes).toString('utf8');
    for (const [name, pattern] of Object.entries(patterns)) for (const m of text.matchAll(pattern)) found[name]!.push(`${path}: ${m[0].slice(0, 24)}`);
    for (const m of text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) if (!hosts.has(m[1]!.toLowerCase())) found['literal/host']!.push(`${path}: ${m[1]}`);
    for (const word of words) if (text.toLowerCase().includes(word.toLowerCase())) found['literal/org']!.push(`${path}: one private name`);
  }
  for (const { path, bytes } of packed) if (path.startsWith('vectors/') || worlds.has(`sha256:${createHash('sha256').update(bytes).digest('hex')}`)) found['package/world-bytes']!.push(path);
  return found;
};

const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)])) : []);
const read = (paths: readonly string[]): File[] => paths.filter((p) => existsSync(join(root, p))).map((p) => ({ path: p, bytes: readFileSync(join(root, p)) }));
const entries = (names: readonly string[]) => names.flatMap((e) => (existsSync(join(root, e)) && statSync(join(root, e)).isDirectory() ? walk(join(root, e)).map((p) => relative(root, p)) : [e]));
const ceiling = (scope: string) => (scope === 'package/world-bytes' ? 0 : Number(lock.find((l) => l.scope === scope)?.value?.split('..')[1] ?? Number.NaN));
const allowed = new Set(['127.0.0.1', 'localhost', '[::1]', ...lock.filter((l) => l.scope?.startsWith('sources/') && URL.canParse(l.value ?? '')).map((l) => new URL(l.value!).hostname.toLowerCase()), ...members(valueOf(lock, 'bound/receiver/origins')).map((origin) => new URL(origin).hostname.toLowerCase())]);
const worlds = new Set(lock.filter((l) => /^world\/[^/]+\/(standing|blob)$/.test(l.scope ?? '')).map((l) => l.value!));

test('a pack carries no literal past the lock-s ceilings — no key or token, no machine-s path, no host but loopback and the lock-s own sources, no private organisation — and no world-s bytes, every world being pinned by its URL and digest', (run) => {
  const packed = read(entries([...(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { files: string[] }).files, 'package.json']));
  const carried = [...packed, ...read(['receipts.bound', ...entries(['src'])])];
  const list = process.env['HEAD_PRIVATE_LITERALS'], words = list && existsSync(list) ? readFileSync(list, 'utf8').split('\n').map((w) => w.trim()).filter(Boolean) : [];
  if (!words.length) run.diagnostic('literal/org unread: this device keeps no private list (HEAD_PRIVATE_LITERALS)');
  run.diagnostic(`read ${carried.length} files, ${packed.length} of them packed${existsSync(join(root, 'dist')) ? '' : ' (no dist: built only on pack)'}`);
  const found = scan(carried, packed, allowed, words, worlds);
  for (const [name, hits] of Object.entries(found)) ok(hits.length <= ceiling(name), `${name} reads ${hits.length}, over its ceiling 0..${ceiling(name)}: ${hits.join(' · ')}`);
});

test('no: each literal a pack must not carry is found by name — a planted key, path, host, private name and world-s bytes each count once', () => {
  const planted = (text: string) => [{ path: 'src/planted.ts', bytes: Buffer.from(text) }];
  const key = ['gh', 'p_', 'x'.repeat(36)].join(''), path = ['', 'Users', 'someone', 'x'].join('/'), host = ['https:', '', 'private.example.net', ''].join('/');
  const bytes = Buffer.from('world bytes'), digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const found = scan(planted(`${key} ${path} ${host} acme-private`), [{ path: 'dist/w.tgz', bytes }], allowed, ['acme-private'], new Set([digest]));
  deepStrictEqual(Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length])), { 'literal/key': 1, 'literal/path': 1, 'literal/host': 1, 'literal/org': 1, 'package/world-bytes': 1 });
});

test('literal hosts: receiver origins are admitted by the lock, and an unrelated origin is still found', () => {
  const origins = members(valueOf(lock, 'bound/receiver/origins'));
  ok(origins.length > 0, 'the receiver has explicit origins');
  for (const origin of origins) deepStrictEqual(scan([{ path: 'TARGET.bound', bytes: Buffer.from(origin) }], [], allowed, [], new Set())['literal/host'], []);
  const outside = ['https:', '', 'unadmitted.example.invalid'].join('/');
  deepStrictEqual(scan([{ path: 'TARGET.bound', bytes: Buffer.from(outside) }], [], allowed, [], new Set())['literal/host'].length, 1);
});
