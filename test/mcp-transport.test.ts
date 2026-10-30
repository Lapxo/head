import { test } from 'node:test';
import { equal, ok, rejects, throws } from 'node:assert/strict';
import { networkFor, publicAddress } from '../src/ports/adapters/network.ts';
import { remoteAt } from '../src/ports/adapters/remote.ts';
import { configuredBytes, configuredDocument, configuredAt } from '../src/ports/adapters/configured.ts';
import { fixture } from './mcp-fixture.ts';
import { createHash } from 'node:crypto';
import { lock } from './place.ts';
import type { Context } from '../src/core/answer.ts';
const limits = { pages: 3, tools: 64, bytes: 16384, wireBytes: 65536, milliseconds: 3000 };
const hash = (b: Uint8Array) => 'sha256:' + createHash('sha256').update(b).digest('hex');
test('MCP network: private, mapped, reserved and mixed DNS results refuse before a connection', async () => {
  for (const ip of ['0.0.0.0','10.0.0.1','100.64.0.1','127.0.0.1','169.254.169.254','172.16.0.1','192.168.1.2','192.0.2.1','198.18.0.1','224.0.0.1','255.255.255.255','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::']) ok(!publicAddress(ip), ip);
  ok(publicAddress('8.8.8.8')); ok(publicAddress('2606:4700:4700::1111'));
  const init = { method: 'POST', redirect: 'manual' as const, credentials: 'omit' as const, signal: AbortSignal.timeout(3000) };
  const resolver = async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }];
  await rejects(networkFor('https://fixture.invalid/mcp', {}, resolver as never)('https://fixture.invalid/mcp', init), /mcp\/destination/);
  for (const endpoint of ['http://fixture.invalid/mcp','https://u:p@fixture.invalid/mcp','https://fixture.invalid/mcp?key=private','https://fixture.invalid/mcp#fragment']) throws(() => networkFor(endpoint), /mcp\/endpoint/);
});
for (const domain of ['sum', 'lookup']) test(`MCP concrete transport ${domain}: DNS pinned, endpoint retained, consent, freshness and cleanup`, async () => {
  const f = await fixture(domain); let dns = 0;
  const network = (endpoint: string) => networkFor(endpoint, { ca: f.ca.toString(), internal: [{ hostname: 'localhost', address: '127.0.0.1' }] }, (async () => { dns++; return [{ address: '127.0.0.1', family: 4 }]; }) as never);
  try {
    const remote = remoteAt(limits, undefined, network), read = await remote.discover(f.endpoint);
    const configuration = { protocol: 'head-configured-mcp@1' as const, name: domain, endpoint: f.endpoint, catalogue: read.digest, offers: [domain] };
    const bytes = configuredBytes(configuration, read.tools), doc = configuredDocument(bytes)!;
    equal(doc.configuration.endpoint, f.endpoint); equal(f.calls(), 0);
    const context = { lock, files: { read: { laidOf: () => [['connected/' + domain + '.json', bytes]] } } } as unknown as Context;
    const declared = [{ scope: 'region/' + domain, measure: 'documents', value: hash(bytes) }];
    equal(configuredAt(context, '/recipient', domain, declared)?.catalogue, read.digest);
    throws(() => configuredAt(context, '/recipient', domain, [{ ...declared[0]!, value: 'sha256:' + '0'.repeat(64) }]), /mcp\/document-pin/);
    const changed = Buffer.from(bytes.toString().replace('head-configured-mcp-document@1','head-configured-mcp-document@2'));
    const altered = { ...context, files: { read: { laidOf: () => [['connected/' + domain + '.json', changed]] } } } as unknown as Context;
    throws(() => configuredAt(altered, '/recipient', domain, [...declared, { scope: 'offers/' + domain + '/' + domain, measure: 'declares', value: 'read-only' }]), /mcp\/document-pin/);
    const refused = remote.prepare(configuration, domain, { value: 2 }, async () => false); ok('send' in refused);
    const no = await refused.send(undefined, 1024); ok(no.kind === 'failed' && no.why === 'mcp/not-authorized'); equal(f.calls(), 0);
    let approvals = 0; const originalArgs = { value: 2 }; const prepared = remote.prepare(configuration, domain, originalArgs, async () => { approvals++; return true; }); ok('send' in prepared); originalArgs.value = 999;
    const result = await prepared.send(undefined, 1024); ok(result.kind === 'got'); equal(JSON.parse(Buffer.from(result.bytes).toString()).content[0].text, domain + ':2'); equal(approvals, 1); equal(f.calls(), 1);
    const tooSmall = await prepared.send(undefined, 1); equal(tooSmall.kind, 'over');
    const oldCalls = f.calls(); f.drift(); const stale = await prepared.send(undefined, 1024); ok(stale.kind === 'failed' && stale.why === 'mcp/catalogue-changed'); equal(f.calls(), oldCalls);
    f.redirect(); const moved = await prepared.send(undefined, 1024); ok(moved.kind === 'failed'); equal(f.calls(), oldCalls);
    ok(dns > 1); ok(f.requests.every(p => p === '/tenant/service/mcp'));
    const stopped = new AbortController(); stopped.abort(); const before = dns; await rejects(remoteAt(limits, stopped.signal, network).discover(f.endpoint)); equal(dns, before);
    for (const extra of [{ headers: { authorization: 'private' } }, { env: { PRIVATE: 'x' } }, { command: 'x' }]) throws(() => configuredDocument(Buffer.from(JSON.stringify({ ...doc, configuration: { ...configuration, ...extra } }))), /mcp\/configuration/);
  } finally { await f.close(); }
});
test('MCP transport: pending DNS is cancelled without opening a socket', async () => {
  const controller = new AbortController(), pending = (() => new Promise(() => {})) as never;
  const timer = setTimeout(() => controller.abort(), 15);
  try { await rejects(networkFor('https://fixture.invalid/mcp', {}, pending)('https://fixture.invalid/mcp', { redirect: 'manual', credentials: 'omit', signal: controller.signal }), /mcp\/cancelled/); }
  finally { clearTimeout(timer); }
});
