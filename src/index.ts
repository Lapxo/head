#!/usr/bin/env node
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { answerOf } from './core/answer.ts';
import type { Asked, Context, Outcome } from './core/answer.ts';
import { parse } from '@lapxo/topos/wire';
import { aboutOf, valueOf } from './core/lock.ts';
import { fill, sayIn } from './core/surface.ts';
import { matchTemplate, refusedOn, shapeOf, shapeSchema, surfaceOf } from './ports/surface.ts';
import { closing, cooled, founded, gate, land, landAct, limits, pinnedAt, policyAt, run, settledView, sign, standingAt, told, warm, words } from './ports/bound.ts';
import { warmth } from './ports/warm.ts';
import { held, keep } from './ports/cache.ts';
import { registryFor } from './ports/signers.ts';
import { dropAt, folderOf, hasAt, layAt, listAt, lockAt, takeAt } from './ports/place.ts';
import * as documents from './ports/documents.ts';
import { keychain } from './ports/keychain.ts';
import { algorithmOf, deviceOf, idIn } from './core/device.ts';
import { publicOf } from './ports/keys.ts';
import { personOf } from './ports/access/person.ts';
import { readAhead } from './ahead/read.ts';

const [ext, root] = ((self) => [self.slice(self.lastIndexOf('.')), fileURLToPath(new URL(self.endsWith('.ts') ? '..' : '../..', self))] as const)(import.meta.url);
const lock = lockAt(root);
const surface = surfaceOf(lock);
const runs = valueOf(lock, 'runs');
Object.assign(words, Object.fromEntries((['read', 'view', 'sign', 'land', 'key', 'signer', 'pin', 'topos', 'standing', 'evidence', 'act', 'profile', 'receipts', 'refusal', 'identity'] as const).map((w) => [w, valueOf(lock, `bound/${w}`)])));
Object.assign(limits, { wait: Number(valueOf(lock, 'bound/wait').split('..')[1]), most: Number(valueOf(lock, 'bound/printed').split('..')[1]) }); Object.assign(gate, { apart: (valueOf(lock, 'reading/apart') ?? '').split('|').filter(Boolean), environment: valueOf(lock, 'reading/environment') ?? '' });
Object.assign(warmth, { spares: Number(valueOf(lock, 'bound/spares').split('..')[1]), boot: valueOf(lock, 'bound/spare-env').split('|') });
/** One call at a time, each after the one before it and never on a timer, so one asked while another lands sees its receipt; bound started ahead for it, and nothing of it kept once it is answered. */
let [last, ahead]: [Promise<unknown>, AbortController] = [Promise.resolve(), new AbortController()];
const turn = <T>(act: () => Promise<T>): Promise<T> => ((next) => { last = next.catch(() => undefined); return next; })(last.then(() => { void warm(runs); return act().finally(cooled); }));
for (const end of ['SIGTERM', 'SIGINT'] as const) process.once(end, () => void last.finally(() => process.exit(0)));
const offered = (n: number) => (n ? { listChanged: false } : undefined);
const server = new Server({ name: surface.name, version: surface.version }, { capabilities: { tools: offered(surface.tools.length), resources: offered(surface.resources.length), prompts: offered(surface.prompts.length) }, instructions: aboutOf(lock, 'prose/en/instructions') });
/** The person, asked as the client lets head ask; every wait on them is counted, so a time ceiling measures head's work and never the person's. */
let waited = 0;
const timed = <A extends unknown[], R>(ask: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => { const t = Date.now(); try { return await ask(...args); } finally { waited += Date.now() - t; } };
const asked = personOf(lock, { can: () => ((e) => ({ url: Boolean(e?.url), form: e !== undefined && (e.form !== undefined || Object.keys(e).length === 0) }))(server.getClientCapabilities()?.elicitation as Record<string, unknown> | undefined), elicit: (params) => server.elicitInput(params as never, { timeout: Number(valueOf(lock, 'access/wait').split('..')[1]) }) });
const person = { consent: timed(asked.consent), enter: timed(asked.enter), choose: timed(asked.choose), visit: timed(asked.visit) };
/** head is its home: the folder of its index of places, and the keychain service its keys live under, one per home, so two heads on one keychain never share a key. A place's root is told to bound by the key id its lock names, its secret kept there under the place's account. */
const home = process.env[valueOf(lock, 'home/env')] || join(process.env[valueOf(lock, `platform/${process.platform}/home`)] ?? '', valueOf(lock, 'home/folder'));
const service = `${deviceOf(lock).service}/${basename(home).replace(/[^\w.-]+/g, '-')}`;
const store = valueOf(lock, `platform/${process.platform}/store`);
const keys = keychain(service, store);
const devices = new Map<string, string>();
const device = (role: string): string | undefined => devices.get(role) ?? ((secret) => (secret === undefined ? undefined : ((key) => { devices.set(role, key); return key; })(publicOf(secret))))(keys.read(deviceOf(lock, role).account));
const asRoot = (account: string) => ((device, key) => [key, device.signer, { BOUND_SIGNERS: registryFor(device.signer, service, account, key, valueOf(lock, 'founding/algorithm'), store) }] as const)(deviceOf(lock), valueOf(lock, 'founding/root').split('/')[1]!);
/** What a call is answered with, one call at a time as when bound blocked head: every bound process it starts is stopped when the client cancels it, and a call cancelled while it waits its turn is never begun. */
const contextOf = (signal?: AbortSignal): Context => {
  /** One call's folds of a place, kept until something lands in it or is laid there; the places its root acted in, whose receipts close once, when the call ends; and those where anything but a read's receipts landed, as bound printed it. */
  const [folds, touched, moved] = [new Map<string, Promise<never>>(), new Set<string>(), new Set<string>()], forget = (place: string) => { for (const k of [...folds.keys()]) if (k.endsWith(`\0${place}`)) folds.delete(k); };
  const read = (at: string | undefined): boolean => at?.startsWith(`${valueOf(lock, 'receipt/at')}:`) === true;
  const once = <T>(key: string, place: string, fold: () => Promise<T>): Promise<T> => (folds.get(`${key}\0${place}`) ?? ((p) => (folds.set(`${key}\0${place}`, p as Promise<never>), p))(fold())) as Promise<T>;
  const acted = (place: string, root: boolean, done: Promise<Outcome>): Promise<Outcome> => done.then((got) => { if ('lines' in got && !got.lines.every((l) => ((f) => f.kind === 'fact' && read(f.value.fields['at']))(parse(l)))) moved.add(place); return got; }).finally(() => { forget(place); if (root) touched.add(place); });
  const signRoot: Context['signRoot'] = (place, lot, account) => sign(runs, place, lot, ...asRoot(account), signal);
  const signAs: Context['signAs'] = (place, lot, role, lines) => ((one, id) => sign(runs, place, lot, id, one.signer, { BOUND_SIGNERS: registryFor(one.signer, service, one.account, id, algorithmOf(lines), store) }, signal))(deviceOf(lock, role), idIn(lines, device(role)) ?? deviceOf(lock, role).account);
  return {
    lock,
    bound: (cwd, args) => run(runs, cwd, args, {}, signal),
    standing: (place) => once('standing', place, () => standingAt(runs, place, (lines) => ['head', 'person'].flatMap((role) => ((id) => (id === undefined ? [] : [id]))(idIn(lines, device(role)))), (line) => read(line.at), signal)),
    policy: (place) => once('policy', place, () => policyAt(runs, place, signal)),
    world: (place, view) => once(`world/${view}`, place, () => settledView(runs, place, view, signal)),
    adapter: async (origin) => ((name) => (!/^[a-z-]+$/.test(name) ? undefined : import(new URL(`./ports/adapters/${name}${ext}`, import.meta.url).href)))(URL.canParse(origin) ? valueOf(lock, `adapter/${new URL(origin).protocol.slice(0, -1)}`) : ''),
    files: { lay: (place, rel, bytes) => { forget(place); layAt(place, rel, bytes); }, drop: (place, rel) => { forget(place); dropAt(place, rel); }, has: hasAt, list: listAt, read: documents, take: takeAt, own: (rel) => takeAt(join(root, rel)) },
    home: () => home,
    personal: () => process.env[valueOf(lock, `platform/${process.platform}/home`)] ?? '',
    found: (place, account) => acted(place, true, founded(runs, place, ...asRoot(account), signal)),
    signRoot,
    landRoot: (place, lot, account) => acted(place, true, landAct(runs, place, lot, ...asRoot(account), signal)),
    moved: (place) => moved.has(place),
    settle: async () => { const red: string[] = []; for (const place of touched) { const why = await closing(runs, place, signal); if (why !== undefined) red.push(sayIn(lock)('receipts-open', { place, why })); } touched.clear(); return red; },
    pinned: (place, file) => pinnedAt(runs, place, file, signal),
    access: async (kind) => (kind !== valueOf(lock, 'access/adapter') || !/^[a-z0-9-]+$/.test(kind) ? undefined : import(new URL(`./ports/access/${kind}${ext}`, import.meta.url).href).then((m: { adapter: never }) => m.adapter)),
    person,
    cache: { keep, held },
    signAs,
    landAs: (place, lot, role, lines) => acted(place, false, ((one, id) => landAct(runs, place, lot, id, one.signer, { BOUND_SIGNERS: registryFor(one.signer, service, one.account, id, algorithmOf(lines), store) }, signal))(deviceOf(lock, role), idIn(lines, device(role)) ?? deviceOf(lock, role).account)),
    land: (place, signed) => acted(place, true, land(runs, place, signed, signal)),
    told: (place, signed) => told(runs, place, signed, words.standing, signal),
    elicit: (message) => person.consent(message, aboutOf(lock, 'said/elicit/yes')),
    now: () => Date.now(),
    machine: () => Date.now() - waited,
    begun: Date.now() - waited,
    keys,
    device,
    roots: async () => (server.getClientCapabilities()?.roots ? (await server.listRoots()).roots.flatMap((root) => folderOf(root.uri) ?? []) : []), client: () => ((c) => (c ? `${c.name}@${c.version}` : undefined))(server.getClientVersion()),
  };
};
const askedOf = (raw: Readonly<Record<string, unknown>> | undefined): Asked => Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, v === undefined ? undefined : typeof v === 'object' ? JSON.stringify(v) : String(v)]));
const schemaOf = (fields: Readonly<{ name: string; about: string; type: string; required: boolean }[]>) => ({ type: 'object' as const,
  properties: Object.fromEntries(fields.map((f) => [f.name, { type: f.type, description: f.about }])), required: fields.filter((f) => f.required).map((f) => f.name) });

if (surface.tools.length) server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: surface.tools.map((tool) => ({ name: tool.name, description: tool.about,
  inputSchema: schemaOf([...tool.fields]), outputSchema: shapeSchema(lock), annotations: Object.fromEntries(tool.hints.map((hint) => [`${hint}Hint`, true])) })) }));
if (surface.tools.length) server.setRequestHandler(CallToolRequestSchema, async (request, extra) => (ahead.abort(), turn(async () => {
  const tool = surface.tools.find((one) => one.name === request.params.name);
  if (tool === undefined) return { isError: true, content: [] };
  const refused = refusedOn(lock, process.platform);
  const context = contextOf(extra.signal), answer = refused !== undefined ? [refused] : extra.signal.aborted ? [] : [...await (await answerOf('tools', tool.name))(askedOf(request.params.arguments), context), ...await context.settle()];
  void ((early) => turn(() => readAhead(shapeOf(answer).cells, contextOf(), early.signal)))(ahead = new AbortController());
  return { content: [{ type: 'text' as const, text: answer.join('\n') }], structuredContent: shapeOf(answer) };
})));
if (surface.resources.length) server.setRequestHandler(ListResourcesRequestSchema, () => ({ resources: [] }));
if (surface.resources.length) server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({ resourceTemplates: surface.resources.map((r) => ({ name: r.name, uriTemplate: r.template, description: r.about, mimeType: r.mime })) }));
if (surface.resources.length) server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => turn(async () => {
  const found = surface.resources.flatMap((r) => ((vars) => (vars === undefined ? [] : [{ r, vars }]))(matchTemplate(r.template, request.params.uri)))[0];
  if (found === undefined) return { contents: [] };
  const refused = refusedOn(lock, process.platform);
  if (refused !== undefined) return { contents: [{ uri: request.params.uri, mimeType: found.r.mime, text: refused }] };
  const lines = await (await answerOf('resources', found.r.name))(askedOf(found.vars), contextOf(extra.signal));
  return { contents: [{ uri: request.params.uri, mimeType: found.r.mime, text: lines.join('\n') }] };
}));
if (surface.prompts.length) server.setRequestHandler(ListPromptsRequestSchema, () => ({ prompts: surface.prompts.map((p) => ({ name: p.name, description: p.about, arguments: p.fields.map((f) => ({ name: f.name, description: f.about, required: f.required })) })) }));
if (surface.prompts.length) server.setRequestHandler(GetPromptRequestSchema, (request) => ((p) => ({ messages: p === undefined ? [] : [{ role: 'user' as const, content: { type: 'text' as const, text: [p.text, p.line].filter(Boolean).map((t) => fill(t, askedOf(request.params.arguments))).join('\n') } }] }))(surface.prompts.find((one) => one.name === request.params.name)));

await server.connect(new StdioServerTransport());
