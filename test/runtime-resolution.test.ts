import { test } from 'node:test';
import { ok, rejects } from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { bundleAt } from '../src/ports/adapters/bundle.ts';
const hash = (b: Uint8Array) => 'sha256:' + createHash('sha256').update(b).digest('hex');
for (const [parent, child] of [['parent', 'child'], ['@neutral/transport', '@neutral/schema']]) test(`runtime: ${parent} and ${child} resolve with closed root exports from a hoisted layout; altered bytes still refuse`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'head-layout-'));
  const manifest = (name: string) => JSON.stringify({name,version:'1.0.0',exports:{'./feature':'./feature.js'}});
  const files = { 'dist/src/index.js': 'process.exit(0);', 'package.json': '{"name":"@lapxo/head","version":"0.2.0","type":"module","author":"Neutral runtime author"}', LICENSE: 'MIT',
    [`node_modules/${parent}/package.json`]: manifest(parent!),
    [`node_modules/${parent}/feature.js`]: 'export const value = 1;',
    [`node_modules/${parent}/node_modules/${child}/package.json`]: manifest(child!),
    [`node_modules/${parent}/node_modules/${child}/feature.js`]: 'export const value = 2;' };
  const runtime = Buffer.from(JSON.stringify({ protocol: 'head-runtime-closure@1', files: Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), digest: hash(Buffer.from(text)) })), bytes: Object.values(files).reduce((n, t) => n + Buffer.byteLength(t), 0) }));
  const write = (path: string, data: string | Buffer) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), data); };
  try {
    for (const [p, text] of Object.entries(files)) write(p.replace(`${parent}/node_modules/${child}`, child!), text);
    write('TARGET.bound', ''); write('runtime.bundle.json', runtime);
    const lock = [['dep/runtime-bundle', hash(runtime)], ['share/bundle-bytes', '0..1048576'], ['share/bundle-selections', '0..64'], ['bound/wait', '60000..60000'], ['bound/printed', '0..16777216']].map(([scope, value]) => ({ scope, value }));
    const made = await bundleAt(root, lock, undefined); ok(made.bytes.length > 0);
    write(`node_modules/${child}/package.json`, JSON.stringify({name:child,version:'2.0.0'}));
    await rejects(bundleAt(root, lock, undefined), /runtime-member/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
