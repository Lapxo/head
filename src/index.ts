#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { aboutOf, members, valueOf, type Said } from './core/lock.ts';
import { fill } from './core/surface.ts';
import { shapeOf, shapeSchema } from './ports/surface.ts';
import { folderOf, lockAt } from './ports/place.ts';
import { askedOf, headOf } from './doors/head.ts';

const [ext, root] = ((self) => [self.slice(self.lastIndexOf('.')), fileURLToPath(new URL(self.endsWith('.ts') ? '..' : '../..', self))] as const)(import.meta.url);
const lock = lockAt(root);
const [door, doors] = [process.argv[3], members(valueOf(lock, 'cli/run/doors'))];
if (process.argv[2] !== valueOf(lock, 'cli/run') || (door !== undefined && !doors.includes(door))) { process.stdout.write(`${aboutOf(lock, 'cli/help')}\n`); process.exit(0); }
if (door !== undefined && door !== doors[0]) { await ((await import(new URL(`./doors/${door}${ext}`, import.meta.url).href)) as { open: (lock: readonly Said[], root: string, ext: string, door: string) => Promise<void> }).open(lock, root, ext, door); process.exit(); }
const offered = (n: number) => (n ? { listChanged: false } : undefined);
const head = headOf(lock, root, ext, {
  can: () => ((e) => ({ url: Boolean(e?.url), form: e !== undefined && (e.form !== undefined || Object.keys(e).length === 0) }))(server.getClientCapabilities()?.elicitation as Record<string, unknown> | undefined), elicit: (params) => server.elicitInput(params as never, { timeout: Number(valueOf(lock, 'access/wait').split('..')[1]) }),
  roots: async () => (server.getClientCapabilities()?.roots ? (await server.listRoots()).roots.flatMap((root) => folderOf(root.uri) ?? []) : []), client: () => ((c) => (c ? `${c.name}@${c.version}` : undefined))(server.getClientVersion()), name: doors[0]!,
}), surface = head.surface;
const server = new Server({ name: surface.name, version: surface.version }, { capabilities: { tools: offered(surface.tools.length), resources: offered(surface.resources.length), prompts: offered(surface.prompts.length) }, instructions: aboutOf(lock, 'prose/en/instructions') });
const schemaOf = (fields: Readonly<{ name: string; about: string; type: string; required: boolean }[]>) => ({ type: 'object' as const,
  properties: Object.fromEntries(fields.map((f) => [f.name, { type: f.type, description: f.about }])), required: fields.filter((f) => f.required).map((f) => f.name) });

if (surface.tools.length) server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: surface.tools.map((tool) => ({ name: tool.name, description: tool.about,
  inputSchema: schemaOf([...tool.fields]), outputSchema: shapeSchema(lock), annotations: Object.fromEntries(tool.hints.map((hint) => [`${hint}Hint`, true])) })) }));
if (surface.tools.length) server.setRequestHandler(CallToolRequestSchema, async (request, extra) => ((answer) => (answer === undefined ? { isError: true, content: [] } : { content: [{ type: 'text' as const, text: answer.join('\n') }], structuredContent: shapeOf(answer) }))(await head.call(request.params.name, request.params.arguments, extra.signal)));
if (surface.resources.length) server.setRequestHandler(ListResourcesRequestSchema, () => ({ resources: [] }));
if (surface.resources.length) server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({ resourceTemplates: surface.resources.map((r) => ({ name: r.name, uriTemplate: r.template, description: r.about, mimeType: r.mime })) }));
if (surface.resources.length) server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => ((got) => ({ contents: got === undefined ? [] : [{ uri: request.params.uri, mimeType: got.mime, text: got.lines.join('\n') }] }))(await head.resource(request.params.uri, extra.signal)));
if (surface.prompts.length) server.setRequestHandler(ListPromptsRequestSchema, () => ({ prompts: surface.prompts.map((p) => ({ name: p.name, description: p.about, arguments: p.fields.map((f) => ({ name: f.name, description: f.about, required: f.required })) })) }));
if (surface.prompts.length) server.setRequestHandler(GetPromptRequestSchema, (request) => ((p) => ({ messages: p === undefined ? [] : [{ role: 'user' as const, content: { type: 'text' as const, text: [p.text, p.line].filter(Boolean).map((t) => fill(t, askedOf(request.params.arguments))).join('\n') } }] }))(surface.prompts.find((one) => one.name === request.params.name)));

await server.connect(new StdioServerTransport());
