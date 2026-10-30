import { configuredSource, fingerprint, type ConfiguredSource, type Tool } from './mcp.ts';
import type { Asked, Context } from '../../core/answer.ts';
import type { Said } from '../../core/lock.ts';
import { valueOf } from '../../core/lock.ts';
import { fieldsOf, vocabOf } from '../../core/read.ts';
import { digestIn } from '../../core/worlds.ts';
import { sayIn } from '../../core/surface.ts';

export const configuredProtocol = Object.freeze({ id: 'mcp', sourceNeeded: 'bundle-mcp-needed', invoke: 'elicit-mcp-call', failurePrefix: 'mcp/', toolFailure: 'mcp/tool',
  connection: (bytes: Uint8Array, source: string, overlay: boolean, v: Pick<ReturnType<typeof vocabOf>, 'offers' | 'class'>) => { const doc = configuredDocument(bytes); if (!doc) return undefined; if (doc.configuration.name !== source || overlay) throw Error('mcp/document'); return { worlds: ['topos-mcp'], verify: (lines: readonly Said[]) => { if (doc.configuration.offers.some(name => !lines.some(l => l.scope === `${v.offers}/${source}/${name}` && l.measure === v.class))) throw Error('mcp/tool-mapping'); } }; }
});
export interface ConfiguredDocument { readonly protocol: 'head-configured-mcp-document@1'; readonly configuration: ConfiguredSource; readonly tools: readonly Tool[]; readonly resource: string }
/** The public document remains input to the published MCP interpreter. Host metadata supplies transport, never an offer class. */
export function configuredDocument(bytes: Uint8Array): ConfiguredDocument | undefined {
  let doc: any; try { doc = JSON.parse(Buffer.from(bytes).toString()); } catch { return undefined; }
  if (doc?.protocol !== 'head-configured-mcp-document@1') return undefined;
  if (Object.keys(doc).sort().join('|') !== 'configuration|protocol|resource|tools' || !Array.isArray(doc.tools)) throw Error('mcp/document');
  const configuration = configuredSource(doc.configuration);
  if (doc.resource !== configuration.endpoint || doc.tools.some((t: any) => !t || typeof t.name !== 'string' || t.inputSchema?.type !== 'object')
    || new Set(doc.tools.map((t: Tool) => t.name)).size !== doc.tools.length || fingerprint(doc.tools).digest !== configuration.catalogue
    || configuration.offers.some(name => !doc.tools.some((t: Tool) => t.name === name))) throw Error('mcp/document');
  return { protocol: doc.protocol, configuration, tools: doc.tools, resource: doc.resource };
}
export const configuredBytes = (configuration: ConfiguredSource, tools: readonly Tool[]): Uint8Array => {
  const bytes = Buffer.from(JSON.stringify({ protocol: 'head-configured-mcp-document@1', configuration, tools, resource: configuration.endpoint }) + '\n');
  configuredDocument(bytes); return bytes;
};
/** Fresh source bytes must be covered by the compiled reading before retained results or a network request can be used. */
export function configuredAt(context: Context, place: string, source: string, lines: readonly Said[]) {
  const laid = context.files.read.laidOf(context, place, source).filter(([path]) => !path.includes('.overlay.'));
  const docs = laid.map(([path, bytes]) => ({ path, bytes, doc: configuredDocument(bytes) })).filter(one => one.doc);
  if (!docs.length) {
    if (lines.some(l => l.scope?.startsWith(`offers/${source}/`) && l.measure === 'declares' && ['read-only', 'unhinted', 'destructive'].includes(l.value ?? ''))) throw Error('mcp/document-pin');
    return undefined;
  }
  const v = vocabOf(context.lock);
  if (docs.length !== 1 || docs[0]!.doc!.configuration.name !== source || !(fieldsOf(lines, `${v.region}/${source}`)[valueOf(context.lock, 'vocab/documents')] ?? []).includes(digestIn(context.lock)(docs[0]!.bytes))) throw Error('mcp/document-pin');
  return docs[0]!.doc!.configuration;
}
/** Discovery is explicitly selected by the consumer; there is no automatic protocol guessing or network on package inspection. */
export async function discoverConfigured(context: Context, asked: Asked, source: string) {
  if (!context.remote || !source || !/^[a-z][a-z0-9-]*$/.test(source)) throw Error('mcp/unavailable');
  const endpoint = asked['document'] ?? '', url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.href !== endpoint) throw Error('mcp/endpoint');
  if (asked['via']) throw Error('mcp/discovery-access-unsupported');
  const read = await (await context.remote()).discover(endpoint);
  const configuration = configuredSource({ protocol: 'head-configured-mcp@1', name: source, endpoint, catalogue: read.digest, offers: read.tools.map(tool => tool.name) });
  return { bytes: configuredBytes(configuration, read.tools), kind: 'json' };
}
/** The same safe, named refusal is used at connect and call, without printing transport exceptions or credentials. */
export const configuredRefusal = (context: Context, error: unknown) => [sayIn(context.lock)('mcp-refused', { why: error instanceof Error && /^mcp\/[a-z-]+$/.test(error.message) ? error.message : 'mcp/transport' })];
/** Verify public configured inputs at inspection, and require an exact compiled operation mapping; never guess tool names. */
export const configuredPackage = (_context: Context, files: ReadonlyMap<string, Uint8Array | undefined>) => [...files].flatMap(([path, bytes]) => { const doc = bytes && path.endsWith('.json') ? configuredDocument(bytes) : undefined; return doc ? [doc] : []; });
