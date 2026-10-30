import { fixture } from './mcp-fixture.ts';
import { test } from 'node:test';
import { ok, equal, deepStrictEqual, rejects, throws } from 'node:assert/strict';
import { remoteFactory, withCatalogue, withConfiguredSource, configuredSource, type PermittedFetch } from '../src/ports/adapters/mcp.ts';
import { associationFor, associationLines } from '../src/core/association.ts';
import { parse } from '@lapxo/topos/wire';
const limits = { pages: 3, tools: 8, bytes: 16384, wireBytes: 65536, milliseconds: 10000 };
for (const domain of ['sum', 'lookup']) test(`configured remote ${domain}: exact endpoint, pinned catalogue, separate invocation consent and no third-party connection`, async () => {
  const f = await fixture(domain);
  try {
    const factory = (endpoint: string, send: PermittedFetch, options: Parameters<typeof remoteFactory>[2]) => remoteFactory(endpoint, (u, i) => send(u, { ...i, redirect: 'manual' }), options);
    const pin = await withCatalogue(options => factory(f.endpoint, f.send, options), limits, undefined, session => session.read());
    const source = configuredSource({ protocol: 'head-configured-mcp@1', name: domain, endpoint: f.endpoint, catalogue: pin.digest, offers: [domain] });
    await withConfiguredSource(source, factory, f.send, limits, undefined, async call => {
      await rejects(call(domain, { value: 2 }, async () => false), /mcp\/not-authorized/); equal(f.calls(), 0);
      await rejects(call('unselected', {}, async () => true), /mcp\/tool/); equal(f.calls(), 0);
      const result = await call(domain, { value: 2 }, async () => true) as { content: { text: string }[] }; equal(result.content[0].text, domain + ':2');
    });
    equal(f.calls(), 1); ok(f.requests.every(p => p === '/tenant/service/mcp'));
    await rejects(withConfiguredSource(source, factory, undefined, limits, undefined, async () => undefined), /mcp\/network-unavailable/);
    await rejects(withConfiguredSource(source, factory, f.send, { ...limits, wireBytes: 1 }, undefined, async () => undefined));
    const stopped = new AbortController(); stopped.abort(); const before = f.requests.length;
    await rejects(withConfiguredSource(source, factory, f.send, limits, stopped.signal, async () => undefined)); equal(f.requests.length, before);
    f.drift(); await rejects(withConfiguredSource(source, factory, f.send, limits, undefined, async () => undefined), /mcp\/catalogue-changed/); equal(f.calls(), 1);
    f.redirect(); await rejects(withConfiguredSource(source, factory, f.send, limits, undefined, async () => undefined)); equal(f.calls(), 1);
    for (const extra of [{ headers: { authorization: 'forbidden' } }, { env: {} }, { command: 'forbidden' }, { endpoint: 'https://name:secret@example.invalid/mcp' }, { endpoint: 'https://example.invalid/mcp?token=forbidden' }, { endpoint: 'http://example.invalid/mcp' }]) throws(() => configuredSource({ ...source, ...extra }));
  } finally { await f.close(); }
});
test('recipient association: inert inspection, decline, restart, coexistence, revision and immutable revision collision', () => {
  const first = { id: 'workspace-one', revision: '1.0.0', digest: 'sha256:' + '1'.repeat(64) };
  equal(associationFor('packages', first, []).state, 'new'); deepStrictEqual(associationLines(associationFor('packages', first, []), '/recipient/place', false, 'policy:fixture/decline'), []);
  const rows = associationLines(associationFor('packages', first, []), '/recipient/place', true, 'policy:fixture/first').map(line => parse(line)).flatMap(p => p.kind === 'fact' ? [p.value.fields] : []);
  equal(associationFor('packages', first, JSON.parse(JSON.stringify(rows))).state, 'same'); deepStrictEqual(associationLines(associationFor('packages', first, rows), '/recipient/place', true, 'policy:fixture/first'), []);
  equal(associationFor('packages', { ...first, id: 'workspace-two' }, rows).state, 'new');
  const next = associationFor('packages', { ...first, revision: '2.0.0', digest: 'sha256:' + '2'.repeat(64) }, rows); equal(next.state, 'revision'); equal(associationLines(next, '/recipient/new-place', true, 'policy:fixture/next').length, 6);
  const collision = associationFor('packages', { ...first, digest: 'sha256:' + '3'.repeat(64) }, rows); equal(collision.state, 'collision'); throws(() => associationLines(collision, '/recipient/place', true, 'policy:fixture/first'));
  ok(associationLines(next, '/recipient/place', true, 'policy:fixture/next').every(line => !/ scope=(allow|keys|uses)\//.test(line)));
});
