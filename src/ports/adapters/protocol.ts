import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Client as RemoteClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { aboutOf, valueOf, type Said } from '../../core/lock.ts';
import { fill } from '../../core/surface.ts';
import { surfaceOf, shapeOf, shapeSchema } from '../surface.ts';
import { folderOf } from '../place.ts';
import { askedOf, headOf } from '../../doors/head.ts';
import type { RemoteFactory } from './mcp.ts';

/** Incoming and outgoing SDK bindings; application decisions stay behind the existing ports. */
export async function serve(lock: readonly Said[], root: string, ext: string, doorName: string, blocked?: readonly string[]) {
const offered = (n: number) => (n ? { listChanged: false } : undefined);
const head: ReturnType<typeof headOf> | undefined = blocked ? undefined : headOf(lock, root, ext, {
  can: () => ((e) => ({ url: Boolean(e?.url), form: e !== undefined && (e.form !== undefined || Object.keys(e).length === 0) }))(server.getClientCapabilities()?.elicitation as Record<string, unknown> | undefined), elicit: (params) => server.elicitInput(params as never, { timeout: Number(valueOf(lock, 'access/wait').split('..')[1]) }),
  roots: async () => (server.getClientCapabilities()?.roots ? (await server.listRoots()).roots.flatMap((root) => folderOf(root.uri) ?? []) : []), client: () => ((c) => (c ? `${c.name}@${c.version}` : undefined))(server.getClientVersion()), name: doorName,
}), surface = head?.surface ?? { ...surfaceOf(lock), resources: [], prompts: [] };
const server: Server = new Server({ name: surface.name, version: surface.version }, { capabilities: { tools: offered(surface.tools.length), resources: offered(surface.resources.length), prompts: offered(surface.prompts.length) }, instructions: aboutOf(lock, 'prose/en/instructions') });
const schemaOf = (fields: Readonly<{ name: string; about: string; type: string; required: boolean }[]>) => ({ type: 'object' as const,
  properties: Object.fromEntries(fields.map((f) => [f.name, { type: f.type, description: f.about }])), required: fields.filter((f) => f.required).map((f) => f.name) });

if (surface.tools.length) server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: surface.tools.map((tool) => ({ name: tool.name, description: tool.about,
  inputSchema: schemaOf([...tool.fields]), outputSchema: shapeSchema(lock), annotations: Object.fromEntries(tool.hints.map((hint) => [`${hint}Hint`, true])) })) }));
if (surface.tools.length) server.setRequestHandler(CallToolRequestSchema, async (request, extra) => ((answer) => (answer === undefined ? { isError: true, content: [] } : { content: [{ type: 'text' as const, text: answer.join('\n') }], structuredContent: shapeOf(answer) }))(blocked ?? await head?.call(request.params.name, request.params.arguments, extra.signal)));
if (surface.resources.length) server.setRequestHandler(ListResourcesRequestSchema, () => ({ resources: [] }));
if (surface.resources.length) server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({ resourceTemplates: surface.resources.map((r) => ({ name: r.name, uriTemplate: r.template, description: r.about, mimeType: r.mime })) }));
if (head && surface.resources.length) server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => ((got) => ({ contents: got === undefined ? [] : [{ uri: request.params.uri, mimeType: got.mime, text: got.lines.join('\n') }] }))(await head.resource(request.params.uri, extra.signal)));
if (surface.prompts.length) server.setRequestHandler(ListPromptsRequestSchema, () => ({ prompts: surface.prompts.map((p) => ({ name: p.name, description: p.about, arguments: p.fields.map((f) => ({ name: f.name, description: f.about, required: f.required })) })) }));
if (head && surface.prompts.length) server.setRequestHandler(GetPromptRequestSchema, (request) => ((p) => ({ messages: p === undefined ? [] : [{ role: 'user' as const, content: { type: 'text' as const, text: [p.text, p.line].filter(Boolean).map((t) => fill(t, askedOf(request.params.arguments))).join('\n') } }] }))(surface.prompts.find((one) => one.name === request.params.name)));

await server.connect(new StdioServerTransport());
}

/** Concrete outgoing SDK transport. Every network operation still goes through the separately permitted host capability. */
export const remoteFactory: RemoteFactory = async (endpoint, send, options) => {
  const client = new RemoteClient({ name: 'head', version: '0' });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), { fetch: (input, init) => send(String(input), init ?? {}), reconnectionOptions: { maxRetries: 0, maxReconnectionDelay: 0, initialReconnectionDelay: 0, reconnectionDelayGrowFactor: 1 } });
  try { await client.connect(transport, options); } catch (error) { await client.close(); throw error; }
  return { list: async (after, opts) => { const got = await client.listTools(after ? { cursor: after } : {}, opts); return { tools: got.tools, ...(got.nextCursor ? { next: got.nextCursor } : {}) }; },
    callTool: (params, opts) => client.callTool(params, undefined, opts), close: () => client.close() };
};
