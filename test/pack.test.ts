import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { lock, root } from './place.ts';
import { members, valueOf } from '../src/core/lock.ts';
import { runtimePortAt, verifiedRuntime, digest } from '../src/ports/adapters/runtime.ts';
import { canonical, parse } from '@lapxo/topos/wire';

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
type References = { readonly origins: readonly string[]; readonly documents: ReadonlyMap<string, string> };
export const scan = (carried: readonly File[], packed: readonly File[], hosts: ReadonlySet<string>, words: readonly string[], worlds: ReadonlySet<string>, references?: References) => {
  const found: Record<string, string[]> = { 'literal/key': [], 'literal/path': [], 'literal/host': [], 'literal/org': [], 'package/world-bytes': [] };
  for (const { path, bytes } of carried) {
    const text = Buffer.from(bytes).toString('utf8');
    for (const [name, pattern] of Object.entries(patterns)) for (const m of text.matchAll(pattern)) found[name]!.push(`${path}: ${m[0].slice(0, 24)}`);
    const publicHosts = new Set([...hosts, ...(references?.origins ?? []).map(origin => { const url = new URL(origin); if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw Error('REFUSE·literal/reference-origin'); return url.hostname.toLowerCase(); })]);
    const chunks = path === 'TARGET.bound' && references ? text.split('\n').flatMap(line => {
      const row = parse(line); if (row.kind !== 'fact') return [{ text: line, allowed: hosts }]; const fields = row.value.fields;
      const field = fields.role === 'writes' && fields.scope?.startsWith('prose/') && fields.measure === 'text' && fields.shape && references.documents.get(fields.shape) === fields.about ? 'about'
        : fields.role === 'writes' && fields.scope === 'literal/public-reference-origins' && fields.measure === 'id' && fields.value === references.origins.join('|') ? 'value' : undefined;
      if (!field) return [{ text: line, allowed: hosts }];
      return [{ text: canonical(Object.fromEntries(Object.entries(fields).filter(([key]) => key !== field))), allowed: hosts }, { text: fields[field] ?? '', allowed: publicHosts }];
    }) : [{ text, allowed: references?.documents.get(path) === text ? publicHosts : hosts }];
    for (const chunk of chunks) for (const m of chunk.text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) if (!chunk.allowed.has(m[1]!.toLowerCase())) found['literal/host']!.push(`${path}: ${m[1]}`);
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
const references: References = { origins: members(valueOf(lock, 'literal/public-reference-origins')), documents: new Map(lock.filter(line => line.role === 'writes' && line.scope?.startsWith('prose/') && line.measure === 'text' && line.shape && line.about !== undefined).map(line => [line.shape!, line.about!])) };

test('a pack carries no literal past the lock-s ceilings — no key or token, no machine-s path, no host but loopback and the lock-s own sources, no private organisation — and no world-s bytes, every world being pinned by its URL and digest', (run) => {
  const cache = mkdtempSync(join(tmpdir(), 'head-pack-audit-')); let names: string[];
  try { const [pack] = JSON.parse(execFileSync('npm', ['--cache', cache, 'pack', '--dry-run', '--ignore-scripts', '--offline', '--json'], { cwd: root, encoding: 'utf8', timeout: Number(valueOf(lock, 'bound/wait').split('..')[1]), maxBuffer: Number(valueOf(lock, 'bound/printed').split('..')[1]) })); names = pack.files.map((file: { path: string }) => file.path); }
  finally { rmSync(cache, { recursive: true, force: true }); }
  const packed = read(names!);
  const port = runtimePortAt(root, valueOf(lock, 'dep/runtime-bundle')), selected = new Map(packed.map(file => [file.path, file.bytes]));
  const verified = verifiedRuntime({ ...port, take: path => selected.get(path) ?? port.take(path) }), provenance = JSON.parse(readFileSync(join(root, 'runtime.lock.json'), 'utf8'));
  ok(verified.execution && verified.execution.version === provenance.version, 'the packaged executable has a declared runtime version');
  deepStrictEqual(packed.filter(file => file.path.startsWith('runtime/')).map(file => file.path).sort(), ['runtime/LICENSE', 'runtime/node']);
  for (const member of [provenance.executable, provenance.license]) deepStrictEqual(digest(selected.get(member.path)!), 'sha256:' + member.sha256, 'third-party bytes match their fixed distribution provenance');
  deepStrictEqual(statSync(join(root, 'runtime/node')).mode & 0o7777, 0o755, 'only the declared safe executable mode');
  for (const file of packed.filter(file => file.path.startsWith('node_modules/'))) ok(verified.files.has(file.path) || verified.auxiliary.has(file.path), `unselected third-party member ${file.path}`);
  const own = packed.filter(file => !file.path.startsWith('runtime/') && !file.path.startsWith('node_modules/'));
  const carried = [...own, ...read(['receipts.bound', ...entries(['src'])])];
  const list = process.env['HEAD_PRIVATE_LITERALS'], words = list && existsSync(list) ? readFileSync(list, 'utf8').split('\n').map((w) => w.trim()).filter(Boolean) : [];
  if (!words.length) run.diagnostic('literal/org unread: this device keeps no private list (HEAD_PRIVATE_LITERALS)');
  run.diagnostic(`read ${carried.length} files, ${packed.length} of them packed${existsSync(join(root, 'dist')) ? '' : ' (no dist: built only on pack)'}`);
  const found = scan(carried, packed, allowed, words, worlds, references);
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

test('public document references grant no permission to place those origins in code or altered documents', () => {
  const text = 'See https://publisher.example/project\n', refs = { origins: ['https://publisher.example'], documents: new Map([['README.md', text]]) };
  deepStrictEqual(scan([{ path: 'README.md', bytes: Buffer.from(text) }], [], new Set(), [], new Set(), refs)['literal/host'], []);
  for (const file of [{ path: 'src/request.ts', bytes: Buffer.from(text) }, { path: 'README.md', bytes: Buffer.from(text + 'changed') }]) deepStrictEqual(scan([file], [], new Set(), [], new Set(), refs)['literal/host']!.length, 1);
  const body = canonical({ at: 'policy:fixture', by: 'target', form: 'alphabet', role: 'writes', measure: 'text', scope: 'prose/en/readme', shape: 'README.md', about: text, value: 'lock' });
  deepStrictEqual(scan([{ path: 'TARGET.bound', bytes: Buffer.from(body) }], [], new Set(), [], new Set(), refs)['literal/host'], []);
  deepStrictEqual(scan([{ path: 'TARGET.bound', bytes: Buffer.from(body.replace('prose/en/readme', 'source/endpoint')) }], [], new Set(), [], new Set(), refs)['literal/host']!.length, 1);
});
