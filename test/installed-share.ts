import { deepStrictEqual, ok } from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { text } from './place.ts';
import { declaredOf } from '../src/core/lock.ts';
import { worldBytes } from './worlds.ts';

const digest = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
/** Public tools in the installed extension; expected runtime digests come only from its pinned inventory. */
export async function installedShare(installed: string) {
  const scratch = mkdtempSync(join(tmpdir(), 'head-installed-share-')), prior = process.env['HEAD_ENTRY'];
  const fixed = readFileSync(join(installed, 'runtime.bundle.json'));
  const profile = declaredOf(readFileSync(join(installed, 'TARGET.bound'), 'utf8'));
  const expected = profile.find(line => line.scope === 'dep/runtime-bundle')?.value;
  ok(digest(fixed) === expected, 'installed inventory matches the profile pin');
  const inventory = JSON.parse(fixed.toString()) as { files: { path: string; bytes: number; digest: string }[] };
  ok(!inventory.files.some(member => member.path === 'node_modules/.package-lock.json'));
  const shared = join(scratch, 'documents'); mkdirSync(shared);
  const canary = 'synthetic-private-' + randomUUID(), keychain = fakeKeychain({});
  const env = { ...keychain.env, HOME: scratch, HEAD_HOME: join(scratch, 'home'), USERPROFILE: scratch, HEAD_PRIVATE_CANARY: canary };
  const yes = () => ({ action: 'accept', content: { yes: true } });
  const calls: unknown[] = [];
  const call = async (name: string, args: Record<string, string>, consent = false) => {
    const [got] = await ask([{ method: 'tools/call', params: { name, arguments: args } }], [shared], env, consent ? yes : undefined);
    calls.push({ name, result: got }); return got;
  };
  const metadata = join(installed, 'node_modules/.package-lock.json'), metadataBytes = existsSync(metadata) ? readFileSync(metadata) : undefined;
  const member = inventory.files.find(member => member.path === 'dist/src/tools/access.js')!;
  const actual = join(installed, member.path), original = readFileSync(actual);
  const domains = [{ source: 'records', operation: 'lookup', path: '/records' }, { source: 'readings', operation: 'latest', path: '/readings' }];
  const results: unknown[] = [];
  try {
    process.env['HEAD_ENTRY'] = join(installed, 'dist/src/index.js');
    for (const [i, domain] of domains.entries()) {
      const place = join(shared, domain.source), document = join(shared, domain.source + '.json');
      writeFileSync(document, JSON.stringify({ openapi: '3.0.3', info: { title: domain.source, version: '1' }, servers: [{ url: `https://${domain.source}.example` }], paths: { [domain.path]: { get: { operationId: domain.operation, security: [], responses: { 200: { description: 'ok' } } } } } }));
      ok(text(await call('place', { dir: place }, true)).includes('head/born'));
      for (const pin of profile.filter(line => /^world\/[^/]+\/blob$/.test(line.scope ?? ''))) {
        const bytes = readFileSync(worldBytes(pin.value!)); ok(digest(bytes) === pin.value);
        const store = join(place, '.bound/cas/blobs'); mkdirSync(store, { recursive: true });
        writeFileSync(join(store, pin.value!.slice(7)), bytes);
      }
      const connected = await call('connect', { place, source: domain.source, document }, true);
      ok(text(connected).includes('head/connected'), text(connected).slice(0, 3000));
      if (i === 0) writeFileSync(metadata, 'different installer bookkeeping\n'); else rmSync(metadata, { force: true });
      const recipe = { id: domain.source + '-desk', revision: '1.0.0', title: domain.source, description: 'Neutral selected source', author: { name: 'Neutral fixture author' }, sources: [{ source: domain.source, namespace: domain.source, offers: [domain.operation] }] };
      const outputs: string[] = [], contents: string[] = [];
      for (const repetition of [1, 2]) {
        const to = join(shared, `${domain.source}-${repetition}.mcpb`);
        const got = await call('share', { place, to, args: JSON.stringify(recipe) });
        ok(text(got).includes('head/bundle-shared') && existsSync(to), text(got).slice(0, 2000));
        const unpacked = join(scratch, `${domain.source}-${repetition}`); execFileSync('unzip', ['-q', to, '-d', unpacked]);
        deepStrictEqual(readFileSync(join(unpacked, 'runtime.bundle.json')), fixed);
        const selection = JSON.parse(readFileSync(join(unpacked, 'composition/selection.json'), 'utf8'));
        deepStrictEqual(selection.sources.map((source: { source: string }) => source.source), [domain.source]);
        for (const m of inventory.files) { const bytes = readFileSync(join(unpacked, m.path)); ok(bytes.length === m.bytes && digest(bytes) === m.digest, m.path); }
        ok(!existsSync(join(unpacked, 'node_modules/.package-lock.json')));
        ok(!existsSync(join(unpacked, '.bound')) && !existsSync(join(unpacked, 'birth.bound')));
        const members = (dir: string, path = ''): string[] => readdirSync(join(dir, path), { withFileTypes: true }).flatMap(e => e.isDirectory() ? members(dir, join(path, e.name)) : [join(path, e.name)]);
        const map = members(unpacked).sort().map(path => { const bytes = readFileSync(join(unpacked, path)); ok(!bytes.includes(Buffer.from(canary))); return [path, digest(bytes)]; });
        contents.push(digest(Buffer.from(JSON.stringify(map)))); outputs.push(digest(readFileSync(to)));
        process.env['HEAD_ENTRY'] = join(unpacked, 'dist/src/index.js');
        const [listed] = await ask([{ method: 'tools/list' }], [], { ...keychain.env, HOME: join(scratch, 'receiver'), HEAD_HOME: join(scratch, 'receiver', String(i), String(repetition)) });
        deepStrictEqual(listed.result.tools.map((tool: { name: string }) => tool.name).sort(), ['ask', 'connect', 'do']);
        process.env['HEAD_ENTRY'] = join(installed, 'dist/src/index.js');
      }
      deepStrictEqual(contents[0], contents[1], 'repeat exports retain identical member paths and bytes');
      const changed = Buffer.from(original); changed[changed.length - 1] ^= 1; writeFileSync(actual, changed);
      const to = join(shared, `${domain.source}-corrupt.mcpb`), got = await call('share', { place, to, args: JSON.stringify(recipe) });
      ok(text(got).includes('bundle/runtime-member') && !existsSync(to), text(got).slice(0, 2000));
      writeFileSync(actual, original);
      results.push({ domain: domain.source, metadata: i ? 'absent' : 'changed', exportedTwice: true, exportedReceiverBooted: true, fixedInventoryUnchanged: true, allRuntimeMembersVerified: inventory.files.length, realRuntimeByteCorruptionRefused: true, privateCanaryAbsent: true, identicalMemberContents: true, identicalContainerBytes: outputs[0] === outputs[1], artifacts: outputs });
    }
    return { node: process.versions.node, inventory: expected, results, calls, credentialsUsed: false, externalApiCalled: false, noExpectedDigestsRegenerated: true };
  } finally {
    writeFileSync(actual, original);
    if (metadataBytes) writeFileSync(metadata, metadataBytes); else rmSync(metadata, { force: true });
    if (prior === undefined) delete process.env['HEAD_ENTRY']; else process.env['HEAD_ENTRY'] = prior;
    rmSync(scratch, { recursive: true, force: true });
  }
}
