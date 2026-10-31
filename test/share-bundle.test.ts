import { test } from 'node:test';
import { deepStrictEqual, ok, rejects } from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonical } from '@lapxo/topos/wire';
import { bundle, type BundlePort, type Runtime } from '../src/ports/adapters/bundle.ts';
import { shareBundle } from '../src/core/share-bundle.ts';
import { lock } from './place.ts';
import { sayIn } from '../src/core/surface.ts';
import { declaredOf } from '../src/core/lock.ts';
import type { Context } from '../src/core/answer.ts';
import type { Recipe, Source } from '../src/core/composition.ts';

const hash = (b: Uint8Array) => `sha256:${createHash('sha256').update(b).digest('hex')}`;
const fixture = { 'dist/src/index.js': Buffer.from('process.exit(0);\n'), 'package.json': Buffer.from('{"name":"@lapxo/head","version":"0.2.0","type":"module","author":"Neutral runtime author"}'), LICENSE: Buffer.from('MIT\n') };
const runtime = (files: Record<string, Buffer> = fixture): BundlePort => {
  const value: Runtime = { protocol: 'head-runtime-closure@1', files: Object.entries(files).map(([path, b]) => ({ path, bytes: b.length, digest: hash(b) })), bytes: Object.values(files).reduce((n, b) => n + b.length, 0) };
  const bytes = Buffer.from(JSON.stringify(value)); return { runtime: bytes, expected: hash(bytes), take: p => files[p], profile: Buffer.from('') };
};
const document = Buffer.from('{"openapi":"3.0.3"}'), pin = Buffer.from('public compiled fixture\n');
const source: Source = { name: 'records', kind: 'compiled', document: hash(document), pin: hash(pin), offers: ['lookup'] };
const recipe: Recipe = { id: 'my-desk', revision: '1.0.0', title: 'My desk', description: 'Selected public sources', author: { name: 'Neutral fixture author' }, sources: [{ source: source.name, namespace: 'records', offers: ['lookup'] }] };
const line = (scope: string, bytes: Buffer, needs: string) => canonical({ at: 'policy:head/share', by: 'target', form: 'alphabet', measure: 'digest', role: 'writes', scope, needs, value: hash(bytes) });
const material = () => ({ sources: [source], files: new Map([['connected/records.json', document], ['compiled/records.bound', pin], ['TARGET.bound', Buffer.from([line('sources/records', document, 'connected/records.json'), line('uses/records', pin, 'compiled/records.bound')].join('\n') + '\n')]]) });
const unpack = (bytes: Buffer) => { const dir = mkdtempSync(join(tmpdir(), 'head-bundle-test-')); const file = join(dir, 'test.mcpb'); requireWrite(file, bytes); return { file, dir, read: (name: string) => execFileSync('unzip', ['-p', file, name]) }; };
import { writeFileSync as requireWrite } from 'node:fs';
const budget = { bytes: 1048576, selections: 64, milliseconds: 60000, printed: 16777216 };

test('share bundle: empty base is a standard bundle without composition, sources or secret configuration', async () => {
  const made = await bundle(runtime(), undefined, budget), zip = unpack(made.bytes);
  try { const names = execFileSync('unzip', ['-Z1', zip.file], { encoding: 'utf8' }); ok(!names.includes('composition/')); const m = JSON.parse(zip.read('manifest.json').toString()); deepStrictEqual(m.server.mcp_config.args, ['${__dirname}/dist/src/index.js', 'run']); ok(!m.user_config); ok(!m.server.mcp_config.env); deepStrictEqual(made.sources, []); } finally { rmSync(zip.dir, { recursive: true, force: true }); }
});
test('share bundle: selected public sources and distinct package identity use the standard packager', async () => {
  const made = await bundle(runtime(), { recipe, ...material() }, budget), zip = unpack(made.bytes);
  try { const m = JSON.parse(zip.read('manifest.json').toString()); deepStrictEqual([m.name, m.version], ['my-desk', '1.0.0']); deepStrictEqual(zip.read('composition/connected/records.json'), document); deepStrictEqual(JSON.parse(zip.read('composition/selection.json').toString()).sources[0].source, 'records'); ok(made.digest !== hash(zip.read('composition/selection.json'))); } finally { rmSync(zip.dir, { recursive: true, force: true }); }
});
test('share bundle: modified/missing runtime, unsafe paths, secret-state paths, public budget and cancellation refuse', async () => {
  const p = runtime(); await rejects(bundle({ ...p, expected: hash(Buffer.from('wrong')) }, undefined, budget), /runtime-digest/);
  await rejects(bundle({ ...p, take: () => undefined }, undefined, budget), /runtime-member/);
  await rejects(bundle(runtime({ ...fixture, '../escape': Buffer.from('no') }), undefined, budget), /runtime-path/);
  await rejects(bundle(runtime(), { recipe, ...material(), files: new Map([['../escape', document]]) }, budget), /public-path/);
  await rejects(bundle(runtime(), { recipe, ...material(), files: new Map([['.bound/key', document]]) }, budget), /public-path/);
  await rejects(bundle(runtime(), { recipe, ...material() }, { ...budget, bytes: 1 }), /public-budget/);
  const stop = new AbortController(); stop.abort(); await rejects(bundle(runtime(), undefined, budget, stop.signal));
});
test('share bundle: action selects only named sources; invalid bytes refuse before output; existing folder share remains separate', async () => {
  const writes: [string, Uint8Array][] = [], rows = [...lock, ...['bundle-refused', 'bundle-shared', 'bundle-source-needed', 'bundle-mcp-needed'].map(key => ({ scope: `said/${key}`, about: key + ' {why}{document}{digest}{sources}', value: 'lock' }))];
  const context = { lock: rows, roots: async () => ['/shared'], files: { has: () => false, publish: async (_: string, p: string, b: Uint8Array) => { writes.push([p.split('/').at(-1)!, b]); } }, bundle: async (payload: any) => { ok(payload.files.has('connected/records.json')); ok(!payload.files.has('connected/other.json')); return { bytes: Buffer.from('archive'), digest: hash(Buffer.from('archive')), sources: ['records'] }; } } as unknown as Context;
  const extra = Buffer.from('unselected public document'); const read = async () => { const m = material(); m.files.set('connected/other.json', extra); const own = declaredOf(m.files.get('TARGET.bound')!.toString()); m.files.set('TARGET.bound', Buffer.from([...own.map(l => canonical(l)), line('sources/other', extra, 'connected/other.json'), line('uses/other', pin, 'compiled/records.bound')].join('\n') + '\n')); m.sources.push({ ...source, name: 'other', document: hash(extra) }); return m; };
  const result = await shareBundle({ place: '/place', to: '/shared/desk.mcpb', args: JSON.stringify(recipe) }, context, read); ok(result?.[0]?.includes('bundle-shared')); deepStrictEqual(writes.map(([p]) => p), ['desk.mcpb']);
  const changed = async () => { const m = material(); m.files.set('connected/records.json', Buffer.from('altered')); return m; };
  writes.length = 0; ok((await shareBundle({ place: '/place', to: '/shared/desk.mcpb', args: JSON.stringify(recipe) }, context, changed))?.some(s => s.includes('bundle/public-digest'))); deepStrictEqual(writes, []);
  deepStrictEqual(await shareBundle({ to: '/shared/folder' }, context, changed), undefined);
});

test('share bundle: real existing Head closure starts without npm and keeps exactly the three public tools', { skip: process.env['HEAD_BASE_BUNDLE'] ? false : 'HEAD_BASE_BUNDLE supplies the retained runtime fixture, not release evidence' }, async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'head-real-export-'));
  try {
    const input = join(scratch, 'input'); execFileSync('unzip', ['-q', process.env['HEAD_BASE_BUNDLE']!, '-d', input]);
    const paths = (dir: string, rel = ''): string[] => readdirSync(join(dir, rel), { withFileTypes: true }).flatMap(e => e.isDirectory() ? paths(dir, join(rel, e.name)) : [join(rel, e.name)]);
    const fixed = readFileSync(join(input, 'runtime.bundle.json')), profile = readFileSync(join(input, 'TARGET.bound'));
    const expected = declaredOf(profile.toString()).find(line => line.scope === 'dep/runtime-bundle')?.value;
    ok(expected && hash(fixed) === expected, 'use the installed pinned inventory unchanged, never derive expected hashes from observed files');
    const port: BundlePort = { runtime: fixed, expected, profile, take: path => { try { return readFileSync(join(input, path)); } catch { return undefined; } } };
    const made = await bundle(port, { recipe, ...material() }, { ...budget, bytes: 16777216 });
    const zip = unpack(made.bytes), destination = join(scratch, 'receiver');
    try {
      execFileSync('unzip', ['-q', zip.file, '-d', destination]);
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js'), { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      const transport = new StdioClientTransport({ command: process.execPath, args: [join(destination, 'dist/src/index.js'), 'run'], env: { PATH: process.env['PATH'] ?? '', HOME: join(scratch, 'home'), HEAD_HOME: join(scratch, 'home'), TMPDIR: scratch } });
      const client = new Client({ name: 'export-consumer', version: '1.0.0' });
      try { await client.connect(transport); deepStrictEqual((await client.listTools()).tools.map(tool => tool.name).sort(), ['ask', 'connect', 'do']); } finally { await client.close(); }
      ok(!paths(destination).some(path => /(^|\/)(\.bound|birth\.bound|\.env)(\/|$)/.test(path)));
      deepStrictEqual(readFileSync(join(destination, 'composition/connected/records.json')), document);
      for (const member of JSON.parse(Buffer.from(port.runtime).toString()).files) deepStrictEqual(hash(readFileSync(join(destination, member.path))), member.digest, member.path);
    } finally { rmSync(zip.dir, { recursive: true, force: true }); }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('share URL: an unconnected HTTPS document asks for the existing consented connect flow; credentials and secret locators refuse', async () => {
  let packed = 0;
  const rows = [...lock, ...['bundle-refused', 'bundle-source-needed', 'bundle-mcp-needed'].map(key => ({ scope: `said/${key}`, about: key + ' {why}{document}', value: 'lock' }))];
  const context = { lock: rows, roots: async () => ['/shared'], files: { has: () => false }, bundle: async () => { packed++; throw Error('unexpected'); } } as unknown as Context;
  for (const [document, expected] of [['https://docs.example/openapi.json', 'bundle-source-needed'], ['https://user:token@docs.example/openapi.json', 'bundle/source-document'], ['https://docs.example/openapi.json?token=secret', 'bundle/source-document']]) {
    const request = { ...recipe, sources: [{ ...recipe.sources[0]!, document }] };
    ok((await shareBundle({ place: '/place', to: '/shared/desk.mcpb', args: JSON.stringify(request) }, context, async () => ({ sources: [], files: new Map() })))?.some(s => s.includes(expected!)));
  }
  const mcp = { ...recipe, sources: [{ ...recipe.sources[0]!, document: 'https://remote.example/mcp', protocol: 'mcp' }] };
  ok((await shareBundle({ place: '/place', to: '/shared/desk.mcpb', args: JSON.stringify(mcp) }, context, async () => ({ sources: [], files: new Map() })))?.some(s => s.includes('bundle-mcp-needed')));
  deepStrictEqual(packed, 0);
});

test('share bundle: bundle and folder exports use the same destination boundary before any write', async () => {
  const { sharePath } = await import('../src/core/package.ts');
  const context = { lock, roots: async () => ['/shared'] } as unknown as Context;
  for (const to of ['/place/.bound/secret.mcpb', '/outside/desk.mcpb', '/place', '/place/.head/desk.mcpb']) ok(!await sharePath(context, '/place', to), to);
  ok(await sharePath(context, '/place', '/shared/desk.mcpb'));
  ok(await sharePath(context, '/place', '/place/export/desk.mcpb'));
});
