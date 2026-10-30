import { test } from 'node:test';
import { deepStrictEqual, ok, rejects, throws } from 'node:assert/strict';
import { compose, type Recipe, type Source } from '../src/core/composition.ts';
import { withCatalogue, type Limits } from '../src/ports/adapters/mcp.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { VERSIONED_MANIFEST_SCHEMAS } from '@anthropic-ai/mcpb';
import { packExtension } from '@anthropic-ai/mcpb';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const vector = JSON.parse(readFileSync('vectors/composition.json', 'utf8')) as { initial: { sources: Source[]; recipe: Recipe } };
const { sources, recipe } = vector.initial;
const limits: Limits = { pages: 3, tools: 10, bytes: 65536, milliseconds: 5000 };
const tool = (name: string): Tool => ({ name, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } });
async function fixture(tools: () => Tool[], next?: (cursor: string | undefined) => string | undefined) {
  const server = new Server({ name: 'neutral-source', version: '1.0.0' }, { capabilities: { tools: {} } }), [client, remote] = InMemoryTransport.createLinkedPair();
  const calls: string[] = [];
  server.setRequestHandler(ListToolsRequestSchema, async req => ({ tools: tools(), ...(next?.(req.params?.cursor) !== undefined ? { nextCursor: next!(req.params?.cursor) } : {}) }));
  server.setRequestHandler(CallToolRequestSchema, async req => { calls.push(req.params.name); return { content: [{ type: 'text', text: JSON.stringify(req.params.arguments) }] }; });
  await server.connect(remote);
  const protocol = new Client({ name: 'head', version: '0.2.1' });
  const connect = async (options: import('../src/ports/adapters/mcp.ts').Options) => { await protocol.connect(client, options); return { list: async (after: string | undefined, opts: typeof options) => { const result = await protocol.listTools(after ? { cursor: after } : undefined, opts); return { tools: result.tools, ...(result.nextCursor === undefined ? {} : { next: result.nextCursor }) }; }, callTool: (params: { name: string; arguments: Record<string, unknown> }, opts: typeof options) => protocol.callTool(params, undefined, opts), close: () => protocol.close() }; };
  return { server, client, calls, connect };
}

test('composition: independent API and MCP domains select existing pins, namespaces and offers deterministically', () => {
  const a = compose(recipe, sources, 10), b = compose({ ...recipe, sources: [...recipe.sources].reverse() }, [...sources].reverse(), 10);
  deepStrictEqual(a.bytes, b.bytes); deepStrictEqual(a.digest, b.digest); deepStrictEqual(a.entries.map(e => e.namespace), ['numbers', 'records']);
  ok(!a.bytes.toString().includes('"get"')); ok(!a.bytes.toString().includes('authorization'));
});
test('composition: collision, unknown offer/source, duplicate selection, missing pin and budget refuse', () => {
  const choose = (sources: Recipe['sources']) => ({ ...recipe, sources });
  throws(() => compose(choose(recipe.sources.map(e => ({ ...e, namespace: 'same' }))), sources, 10), /collision/);
  throws(() => compose(choose([{ ...recipe.sources[0]!, offers: ['delete'] }]), sources, 10), /offer/);
  throws(() => compose(choose([{ ...recipe.sources[0]!, source: 'absent' }]), sources, 10), /source/);
  throws(() => compose(choose([recipe.sources[0]!, { ...recipe.sources[0]!, namespace: 'other' }]), sources, 10), /collision/);
  throws(() => compose(recipe, [{ ...sources[0]!, pin: '' }, sources[1]!], 10), /pin/);
  throws(() => compose(recipe, sources, 1), /recipe/);
});
for (const domain of ['sum', 'lookup']) test(`MCP ${domain}: pinned discovery and explicit authorization; hints grant nothing; closes on completion`, async () => {
  const f = await fixture(() => [tool(domain)]); let closed = false; f.client.onclose = () => { closed = true; };
  try {
    await withCatalogue(f.connect, limits, undefined, async session => {
      const read = await session.read(); ok(read.tools[0]!.annotations?.readOnlyHint);
      await rejects(session.call(read.digest, domain, {}, async () => false), /not-authorized/); deepStrictEqual(f.calls, []);
      const got = await session.call(read.digest, domain, { x: 2 }, async () => true) as { content: { text: string }[] };
      deepStrictEqual(JSON.parse(got.content[0]!.text), { x: 2 }); deepStrictEqual(f.calls, [domain]);
    });
    ok(closed);
  } finally { await f.server.close(); }
});
test('MCP: metadata drift, unknown tool and catalogue collision refuse before invocation', async () => {
  let entries = [tool('sum')]; const f = await fixture(() => entries);
  try { await withCatalogue(f.connect, limits, undefined, async session => {
    const first = await session.read(); entries = [{ ...tool('sum'), description: 'changed' }];
    await rejects(session.call(first.digest, 'sum', {}, async () => true), /catalogue-changed/);
    const after = await session.read(); await rejects(session.call(after.digest, 'sum', {}, async () => { entries = [tool('other')]; return true; }), /catalogue-changed/);
    const now = await session.read(); await rejects(session.call(now.digest, 'absent', {}, async () => true), /mcp\/tool/);
    entries = [tool('sum'), tool('sum')]; await rejects(session.read(), /collision/); deepStrictEqual(f.calls, []);
  }); } finally { await f.server.close(); }
});
test('MCP: cyclic pagination, page/tool/byte budgets, cancellation and cleanup', async () => {
  for (const [changed, next, cause] of [
    [{ ...limits, tools: 1 }, undefined, /budget/], [{ ...limits, bytes: 1 }, undefined, /budget/],
    [limits, () => 'same', /collision|page-loop/], [{ ...limits, pages: 1 }, () => 'next', /budget/],
  ] as const) {
    const f = await fixture(() => [tool('sum'), tool('lookup')], next);
    try { await rejects(withCatalogue(f.connect, changed, undefined, session => session.read()), cause); } finally { await f.server.close(); }
  }
  const f = await fixture(() => [tool('sum')]), controller = new AbortController(); controller.abort();
  try { await rejects(withCatalogue(f.connect, limits, controller.signal, session => session.read())); deepStrictEqual(f.calls, []); } finally { await f.server.close(); }
});
test('mcpb: standard packager preserves a composition and source data; distinct identities, no secret configuration', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'head-composition-format-'));
  try {
    for (const id of ['reference-desk', 'calculation-desk']) {
      const dir = join(scratch, id); mkdirSync(dir);
      const made = compose({ ...recipe, id }, sources, 10);
      const manifest = { manifest_version: '0.3', name: id, display_name: recipe.title, version: recipe.revision, description: recipe.description, author: { name: 'Package author' },
        server: { type: 'node', entry_point: 'server.js', mcp_config: { command: 'node', args: ['${__dirname}/server.js'] } }, compatibility: { platforms: ['darwin'] } };
      VERSIONED_MANIFEST_SCHEMAS['0.3'].parse(manifest);
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest)); writeFileSync(join(dir, 'composition.json'), made.bytes);
      // Inert format fixture, deliberately not represented as an installable Head runtime.
      writeFileSync(join(dir, 'server.js'), 'throw Error("format fixture, not a Head runtime");\n');
      writeFileSync(join(dir, 'LICENSE'), 'MIT\n');
      const output = join(scratch, `${id}.mcpb`); ok(await packExtension({ extensionPath: dir, outputPath: output, silent: true }));
      deepStrictEqual(execFileSync('unzip', ['-p', output, 'composition.json']), made.bytes);
      const members = execFileSync('unzip', ['-Z1', output], { encoding: 'utf8' }).trim().split('\n').sort();
      deepStrictEqual(members, ['LICENSE', 'composition.json', 'manifest.json', 'server.js']);
      const unpacked = JSON.parse(execFileSync('unzip', ['-p', output, 'manifest.json'], { encoding: 'utf8' }));
      deepStrictEqual(unpacked.name, id); ok(!JSON.stringify(unpacked).includes('env')); ok(readFileSync(output).length > 0);
    }
    throws(() => VERSIONED_MANIFEST_SCHEMAS['0.3'].parse({ manifest_version: '0.3', name: 'bad' }));
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
