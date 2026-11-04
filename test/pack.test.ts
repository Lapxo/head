import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { lock, root } from './place.ts';
import { members, valueOf } from '../src/core/lock.ts';
import { runtimePortAt, verifiedRuntime } from '../src/ports/adapters/runtime.ts';
import { canonical, parse } from '@lapxo/topos/wire';

export { scan } from './pack-literals.ts';
import { scan, type File, type References } from './pack-literals.ts';
import { auditAt } from './security-publication-files.ts';
import { run as currentSecurity } from './security-reading.ts';

const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)])) : []);
const read = (paths: readonly string[]): File[] => paths.filter((p) => existsSync(join(root, p))).map((p) => ({ path: p, bytes: readFileSync(join(root, p)) }));
const entries = (names: readonly string[]) => names.flatMap((e) => (existsSync(join(root, e)) && statSync(join(root, e)).isDirectory() ? walk(join(root, e)).map((p) => relative(root, p)) : [e]));
const ceiling = (scope: string) => (scope === 'package/world-bytes' ? 0 : Number(lock.find((l) => l.scope === scope)?.value?.split('..')[1] ?? Number.NaN));
const allowed = new Set(['127.0.0.1', 'localhost', '[::1]', ...lock.filter((l) => l.scope?.startsWith('sources/') && URL.canParse(l.value ?? '')).map((l) => new URL(l.value!).hostname.toLowerCase()), ...members(valueOf(lock, 'bound/receiver/origins')).map((origin) => new URL(origin).hostname.toLowerCase())]);
const worlds = new Set(lock.filter((l) => /^world\/[^/]+\/(standing|blob)$/.test(l.scope ?? '')).map((l) => l.value!));
const references: References = { origins: members(valueOf(lock, 'literal/public-reference-origins')), documents: new Map(lock.filter(line => line.role === 'writes' && line.scope?.startsWith('prose/') && line.measure === 'text' && line.shape && line.about !== undefined).map(line => [line.shape!, line.about!])) };

test('a pack carries no literal past the lock-s ceilings — no key or token, no machine-s path, no host but loopback and the lock-s own sources, only selected public content — and no world-s bytes, every world being pinned by its URL and digest', (run) => {
  const {counts:found,selectedPaths:names,carriedFiles,packed}=auditAt(root,lock);
  const previous=process.cwd();try{process.chdir(root);const controls=currentSecurity('src');deepStrictEqual(controls.length,6);ok(controls.every(r=>r.bound.lo===0&&r.bound.hi===0),'fresh current security controls, including current README coverage');}finally{process.chdir(previous);}
  const port = runtimePortAt(root, valueOf(lock, 'dep/runtime-bundle')), selected = new Map(packed.map(file => [file.path, file.bytes]));
  const verified = verifiedRuntime({ ...port, take: path => selected.get(path) ?? port.take(path) });
  deepStrictEqual(verified.execution, undefined, 'the package uses a client or installed Node');
  deepStrictEqual(packed.filter(file => file.path.startsWith('runtime/')), [], 'no Node binary or bundled runtime is delivered');
  ok(!JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).bundleDependencies, 'npm resolves dependencies normally');
  for (const file of packed.filter(file => file.path.startsWith('node_modules/'))) ok(verified.files.has(file.path) || verified.auxiliary.has(file.path), `unselected third-party member ${file.path}`);
  run.diagnostic(`read ${carriedFiles} files; public selection uses no private dictionary`);
  for (const [name, count] of Object.entries(found)) ok(count <= ceiling(name), `${name} reads ${count}, over its ceiling 0..${ceiling(name)}`);
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
