import { test } from 'node:test';
import { deepStrictEqual, ok, rejects, throws } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bundle, type Runtime, type BundlePort } from '../src/ports/adapters/bundle.ts';
import { verifiedRuntime } from '../src/ports/adapters/runtime.ts';

const hash = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const files: Record<string, Buffer> = { 'dist/src/index.js': Buffer.from('process.exit(0);\n'), 'package.json': Buffer.from('{"name":"@lapxo/head","version":"0.2.2","author":"Neutral runtime fixture"}'), LICENSE: Buffer.from('MIT\n'), 'runtime/node': Buffer.from('#!/bin/sh\nexit 0\n'), 'runtime/LICENSE': Buffer.from('Neutral container fixture; not a Node executable or license\n') };
const closure = (edit: (runtime: Runtime) => void = () => undefined): BundlePort => {
  const runtime: Runtime = { protocol: 'head-runtime-closure@2', execution: { platform: 'darwin', architectures: ['arm64', 'x64'], path: 'runtime/node', license: 'runtime/LICENSE', mode: 0o755, version: 'v24.22.2' }, files: Object.entries(files).map(([path, bytes]) => ({ path, bytes: bytes.length, digest: hash(bytes) })), bytes: Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0) };
  edit(runtime); const bytes = Buffer.from(JSON.stringify(runtime)); return { runtime: bytes, expected: hash(bytes), profile: Buffer.from(''), take: path => files[path] };
};
const bounds = { bytes: 1048576, selections: 64, milliseconds: 60000, printed: 16777216 };

test('standalone container manifest uses its declared executable and preserves its executable mode', async () => {
  const made = await bundle(closure(), undefined, bounds), dir = mkdtempSync(join(tmpdir(), 'head-binary-container-'));
  try {
    const archive = join(dir, 'base.mcpb'); writeFileSync(archive, made.bytes); execFileSync('unzip', ['-q', archive, '-d', join(dir, 'installed')]);
    const root = join(dir, 'installed'), manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
    deepStrictEqual(manifest.server, { type: 'binary', entry_point: 'runtime/node', mcp_config: { command: '${__dirname}/runtime/node', args: ['${__dirname}/dist/src/index.js', 'run'] } });
    deepStrictEqual(manifest.compatibility, { platforms: ['darwin'] });
    deepStrictEqual(readFileSync(join(root, 'runtime/node')), files['runtime/node']);
    deepStrictEqual(statSync(join(root, 'runtime/node')).mode & 0o7777, 0o755);
    ok(!(statSync(join(root, 'dist/src/index.js')).mode & 0o111));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('standalone runtime refuses altered or absent bytes and execution-policy substitutions', async () => {
  for (const path of ['runtime/node', 'runtime/LICENSE']) {
    const port = closure(); await rejects(bundle({ ...port, take: name => name === path ? Buffer.from('changed') : port.take(name) }, undefined, bounds), /bundle\/runtime-member/);
    await rejects(bundle({ ...port, take: name => name === path ? undefined : port.take(name) }, undefined, bounds), /bundle\/runtime-member/);
  }
  for (const change of [{ path: '../outside' }, { mode: 0o4755 }, { platform: 'other' }, { architectures: ['arm64'] }, { command: 'node' }]) {
    await rejects(bundle(closure(runtime => Object.assign(runtime.execution!, change)), undefined, bounds), /bundle\/runtime-execution/);
  }
  await rejects(bundle(closure(runtime => Object.assign(runtime, { protocol: 'head-runtime-closure@1' })), undefined, bounds), /bundle\/runtime-execution/);
});

test('optional development members are checked when present but are never executable runtime members', () => {
  const body = Buffer.from('export declare const value: number;\n'), path = 'node_modules/neutral/types.d.ts', original = closure();
  const value = JSON.parse(Buffer.from(original.runtime).toString()); value.auxiliary = [{ path, bytes: body.length, digest: hash(body) }];
  const make = (data: unknown, take = (name: string) => name === path ? body : original.take(name)) => { const runtime = Buffer.from(JSON.stringify(data)); return { ...original, runtime, expected: hash(runtime), take }; };
  const present = verifiedRuntime(make(value)); ok(present.auxiliary.has(path)); ok(!present.files.has(path));
  ok(!verifiedRuntime(make(value, original.take)).auxiliary.has(path), 'the optional material is not required by the extension runtime');
  const changed = make(value, name => name === path ? Buffer.from('altered') : original.take(name));
  throws(() => verifiedRuntime(changed), /runtime-member/);
  for (const auxiliary of [[{ ...value.auxiliary[0], path: 'node_modules/neutral/code.js' }], [...value.auxiliary, ...value.auxiliary]]) {
    throws(() => verifiedRuntime(make({ ...value, auxiliary }, original.take)), /runtime-auxiliary/);
  }
});
