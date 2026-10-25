import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { members, valueOf } from '../src/core/lock.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { lock } from './place.ts';

const bundle = process.env['HEAD_BUNDLE'];
const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });

test('the Desktop Extension as a host runs it: unpacked in a folder of its own, the command its manifest names started in a fresh home, it offers the tools the lock-s surface names, founds a place, connects a document and reads one offer', { skip: bundle ? false : 'HEAD_BUNDLE names no bundle' }, async () => {
  const unpacked = mkdtempSync(join(tmpdir(), 'head-unpacked-'));
  execFileSync('unzip', ['-q', bundle!, '-d', unpacked]);
  const bundleMembers = execFileSync('unzip', ['-Z1', bundle!], { encoding: 'utf8' }).trim().split('\n');
  deepStrictEqual(bundleMembers.filter((name) => name.endsWith('.mts') || /changelog/i.test(name)), [], 'the delivered bundle excludes TypeScript module declarations and changelogs');
  const inventory = (dir: string, path = ''): string[] => readdirSync(join(dir, path), { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? inventory(dir, join(path, entry.name)) : [`${join(path, entry.name)} ${createHash('sha256').update(readFileSync(join(dir, path, entry.name))).digest('hex')}`]).sort();
  deepStrictEqual(inventory(join(unpacked, 'node_modules/@lapxo/bound')), inventory(dirname(createRequire(import.meta.url).resolve('@lapxo/bound/package.json'))), 'the bundled instrument retains every installed member, including declarations, byte for byte');
  const manifest = JSON.parse(readFileSync(join(unpacked, 'manifest.json'), 'utf8')) as { server: { mcp_config: { args: string[] } } };
  const before = process.env['HEAD_ENTRY'];
  process.env['HEAD_ENTRY'] = manifest.server.mcp_config.args[0]!.replace('${__dirname}', unpacked);
  const server = createServer((_, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"id":1}'); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-smoke-'))];
    const env = { ...fakeKeychain({}).env, HEAD_HOME: home }, place = join(shared, 'mine'), yes = () => ({ action: 'accept', content: { yes: true } });
    writeFileSync(join(shared, 'weather.json'), JSON.stringify({ openapi: '3.0.3', info: { title: 'weather', version: '1' }, servers: [{ url: origin }],
      paths: { '/forecast': { get: { operationId: 'getForecast', security: [], responses: { 200: { description: 'ok' } } } } } }));
    const [listed] = await ask([{ method: 'tools/list' }], [], env);
    await ask([tool('place', { dir: place })], [], env, yes);
    await ask([tool('connect', { place, source: 'weather', document: join(shared, 'weather.json') })], [shared], env, yes);
    const [read] = await ask([tool('look', { place, source: 'weather', operation: 'getForecast', at: '8' })], [], env, yes);
    deepStrictEqual((listed.result.tools as { name: string }[]).map((t) => t.name).sort(), [...members(valueOf(lock, 'surface/tools'))].sort());
    ok((read.result.structuredContent.cells as { code: string; fields: Record<string, string> }[]).some((c) => c.code === 'head/answered' && c.fields['status'] === '200' && c.fields['operation'] === 'getForecast'), JSON.stringify(read.result).slice(0, 800));
  } finally {
    server.close();
    if (before === undefined) delete process.env['HEAD_ENTRY']; else process.env['HEAD_ENTRY'] = before;
  }
});
