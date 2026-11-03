import { discoverConfigured, configuredRefusal, configuredProtocol } from '../ports/adapters/configured.ts';
import { receiverConnect } from '../core/receiver.ts';
import { canonical, EXTENSION } from '@lapxo/topos/wire';
import { inPlace, placeOf, unless } from '../core/answer.ts';
import type { Asked, Context } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import { fieldsOf, vocabOf } from '../core/read.ts';
import { shapeOf } from '../ports/surface.ts';
import { join } from 'node:path';
import { redIn, sayIn } from '../core/surface.ts';
import { digestIn, linesOf } from '../core/worlds.ts';
import { coveredIn, owedIn, retainedIn, unpacked } from '../core/package.ts';
import { paidBy, pinIn } from '../compile/pin.ts';
import { adopted, compileViews } from '../adopt/adopt.ts';
import type { Line } from '../compile/pin.ts';
import { firstRun } from '../onboard/first.ts';
import { resolved } from '../onboard/site.ts';
import { receivedBirth } from '../links/birth.ts';
import { linked } from '../links/inspect.ts';
import { rootIn } from '../flows/device.ts';
import { attachedFor } from './access.ts';
import type { Read } from '../ports/documents.ts';

/**
 * A source connected to a place, once the person said yes; a lock is no source, and adopting one as a parent is refused
 * by name, since composing two places' policies is bound's. A document — and an overlay beside it — is laid whatever its
 * kind, with every world head carries adopted, and the fold decides which reads it: what no world compiles is open, the
 * bytes taken back and the line that pays it handed on. What one does is compiled once per digest of what it read — the
 * same bytes again find their compiled standing by name — and pinned from the place's store: a new pin lands with the
 * old one's withdraw, said at its own time, since a withdrawn saying stays withdrawn. A lock named by its digest is a
 * package another place shared: checked whole, then — on one yes to all it names — each source connected in the order
 * its pins rest in, its pin held to the package's; one that differs is refused by name, and the place holds what it
 * compiled. Nothing the sharing place was granted comes with it: access is asked here, issuer by issuer.
 */
export const connected = async (asked: Asked, context: Context, covered = false): Promise<readonly string[]> => {
  const received = (await receiverConnect(asked, context)) ?? (await receivedBirth(asked, context));
  if (received) return received;
  if (members(valueOf(context.lock, 'link/prefixes')).some(prefix => (asked['document'] ?? '').startsWith(prefix))) return linked(asked, context);
  const selected = await placeOf(asked, context); if (typeof selected === 'object') return selected.said;
  const root = selected ? await rootIn(context, selected) : undefined; if (root && 'said' in root) return root.said;
  const got = asked['protocol'] === configuredProtocol.id ? { asked } : await resolved(asked, context);
  return 'said' in got ? got.said : connectedAs({ ...got.asked, ...(selected ? { place: selected } : {}) }, context, covered, root);
};
const connectedAs = async (asked: Asked, context: Context, covered = false, selectedRoot?: Awaited<ReturnType<typeof rootIn>>): Promise<readonly string[]> => (asked['source'] && !(await placeOf(asked, context)) ? firstRun(asked, context, (dir, covered) => connected({ ...asked, place: dir }, context, covered))
  : ((started) => inPlace(asked, context, async (place) => {
  const say = sayIn(context.lock), digest = digestIn(context.lock), { documentOf, fetchedAs, kindOf } = context.files.read;
  const [source, document] = [(asked['source'] ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-'), asked['document'] ?? ''];
  const [via, named, accept, lock] = [asked['via'] ?? '', asked['digest'] ?? '', /^[\w.+-]+\/[\w.+-]+$/.test(asked['accept'] ?? '') ? asked['accept'] : undefined, `.${kindOf(document)}` === EXTENSION];
  if (lock && !named) return [say('parent-lock', { place, parent: source || document })];
  if (!source && !lock) return [say('missing-param', { operation: 'connect', param: 'source' })];
  const root = selectedRoot ?? await rootIn(context, place);
  if ('said' in root) return root.said;
  if (named && !/^sha256:[0-9a-f]{64}$/.test(named)) return [say('document-digest', { document, digest: named, got: '' })];
  if (lock) return ((read) => (read === undefined ? [say('document-unread', { document })] : digest(read.bytes) !== named ? [say('document-digest', { document, digest: named, got: digest(read.bytes) })]
    : received(context, place, document, read.bytes, named, root.account)))(await documentOf(context, place, document, named));
  const refused = covered ? undefined : await unless(context, say('elicit-connect', { source, document, place, overlay: asked['overlay'] ?? '' }));
  if (refused) return refused;
  const got = via ? await attachedFor(context, place, via) : undefined;
  if (got && 'said' in got) return got.said;
  const [read, overlay] = [asked['protocol'] === configuredProtocol.id ? await discoverConfigured(context, asked, source) : got ? await fetchedAs(context, document, via, got, named, accept) : await documentOf(context, place, document, named), asked['overlay'] ? await documentOf(context, place, asked['overlay']) : undefined];
  if (read !== undefined && 'said' in read) return read.said;
  if (read === undefined || (asked['overlay'] && overlay === undefined)) return [say('document-unread', { document })];
  if (named && digest(read.bytes) !== named) return [say('document-digest', { document, digest: named, got: digest(read.bytes) })];
  return `.${read.kind}` === EXTENSION ? [say('parent-lock', { place, parent: source })] : context.receiving(place, async () => { await context.policy(place, true); return (await laidIn(context, place, root.account)(source, document, read, overlay, started)).said; });
}))(context.machine())).catch(error => { if (error instanceof Error && error.message.startsWith('receive/')) return [sayIn(context.lock)('receive-refused', { place: asked['place'], document: asked['document'], digest: asked['digest'], why: error.message })]; if (asked['protocol'] === configuredProtocol.id || error instanceof Error && error.message.startsWith(configuredProtocol.failurePrefix)) return configuredRefusal(context, error); throw error; });

type Connection = { readonly said: readonly string[]; readonly connected: boolean };
type Laid = (source: string, document: string, doc: Read, overlay: Read | undefined, started: number) => Promise<Connection>;
export const received = async (context: Context, place: string, document: string, bytes: Uint8Array, named: string, account: string, publicFiles?: ReadonlyMap<string, Uint8Array | undefined>, guarded = false): Promise<readonly string[]> => {
  if (!guarded) { try { return await context.receiving(place, () => received(context, place, document, bytes, named, account, publicFiles, true)); } catch (error) { if (!(error instanceof Error) || !error.message.startsWith('receive/')) throw error; return [sayIn(context.lock)('receive-refused', { place, why: error.message, document, digest: named })]; } }
  const [say, got] = [sayIn(context.lock), unpacked(context, document, bytes, publicFiles ?? await context.files.read.besideOf(context, document, linesOf(bytes)))];
  if (!got.sources) return got.said ?? [];
  const [names, said, before] = [got.sources.map((s) => s.source).join(', '), [] as string[], await context.policy(place)];
  const refused = publicFiles || coveredIn(context, 'refused' in before ? [] : before.lines, got.sources, named) ? undefined : await unless(context, say('elicit-receive', { place, package: named, sources: names || '—', open: (got.open ?? []).map((o) => o.source).join(', ') || '—' }));
  if (refused) return refused;
  const retained = 'refused' in before ? new Set<string>() : retainedIn(context, place, before.lines, got.sources, linesOf(bytes));
  const pending = got.sources.filter(s => !retained.has(s.source));
  if (pending.length) said.push(...await receivedBatch(context, place, pending, account));
  if (shapeOf(said).cells.some(c => ['refused', 'open'].includes(c.state))) return said;
  const held = await context.policy(place), [pinOf, owed] = [(source: string) => ('refused' in held ? '' : held.lines.find((l) => l.scope === `uses/${source}`)?.value ?? ''), owedIn(context, 'refused' in held ? [] : held.lines, got.sources, got.open ?? [], named)];
  const [off, landed] = [got.sources.filter((s) => pinOf(s.source) !== s.pin), owed.length ? await context.landRoot(place, owed, account) : undefined];
  const closure = await context.settle(place); if (closure.length) return [...said, ...closure];
  return [...said, ...(off.length ? off.map((s) => say('package-pin', { source: s.source, pin: s.pin, got: pinOf(s.source) || 'none' })) : names ? [say('received', { place, package: named, sources: names })] : []),
    ...(got.open ?? []).map((o) => say('received-open', { source: o.source, waits: o.waits })), ...(landed && 'refused' in landed ? [say('not-landed', { why: landed.refused })] : [])];
};
export const laidIn = (context: Context, place: string, account: string, reconcile = true, reading: readonly string[] = []): Laid => (source, document, doc, overlay, started) => (async () => {
  const say = sayIn(context.lock), v = vocabOf(context.lock), word = (k: string) => valueOf(context.lock, k), digest = digestIn(context.lock);
  const lands = (lot: readonly string[]) => context.landRoot(place, lot, account);
  const line: Line = (scope, measure, value, more = {}) => canonical({ at: 'policy:head/connect', by: 'target', form: 'alphabet', measure, role: 'writes', scope, value, ...more });
  const configured = configuredProtocol.connection(doc.bytes, source, overlay !== undefined, v);
  const [pin, worlds] = [pinIn(context, place, lands, line, configured?.verify), await adopted(context, place, lands, line, configured?.worlds ?? [])];
  if ('refused' in worlds) return { said: [say('not-landed', { why: worlds.refused })], connected: false };
  const laid = [[`${word('place/connected')}/${source}.${doc.kind}`, doc.bytes] as const, ...(overlay ? [[`${word('place/connected')}/${source}.overlay.${overlay.kind}`, overlay.bytes] as const] : [])];
  for (const [at, bytes] of laid) context.files.lay(place, at, bytes);
  const pinned = await pin(source, [...laid.map(([at, bytes]) => `${at} ${digest(bytes)}`), ...reading]);
  if ('said' in pinned) {
    if (pinned.open || pinned.dropped) for (const [at] of laid) context.files.drop(place, at);
    return { said: pinned.open ? [say('no-world', { kind: doc.kind, document }), line(`${word('place/needs')}/${doc.kind}`, 'id', valueOf(context.lock, 'birth/view/place'), { role: 'demands' })] : pinned.said, connected: false };
  }
  const declared = fieldsOf(pinned.lines, `${v.region}/${source}`)[v.origins] ?? [], fetched = URL.canParse(document) && !declared.some((o) => URL.canParse(o)) && ((held) => 'lines' in held && !held.lines.some((l) => l.scope === `${v.pick}/${source}`))(await context.policy(place));
  const picked = fetched ? await lands([line(`${v.pick}/${source}`, 'id', new URL(declared[0] ?? '/', document).href.replace(/\/$/, ''))]) : undefined;
  const [owed, paid] = [pinned.lines.filter((l) => l.measure === v.unresolved).map((l) => l.value ?? ''), reconcile ? await paidBy(context, place, pin, laid[0]![0]) : []];
  const classes = pinned.lines.filter((l) => l.measure === v.class && l.scope?.startsWith(`${v.offers}/${source}/`) && l.scope.split('/').length === 3);
  return { connected: picked === undefined || !('refused' in picked), said: [say('connected', { source, place, offers: String(classes.length), reads: String(classes.filter((l) => l.value === v.callable).length), pin: pinned.pin }),
    ...(owed.length ? [say('unresolved', { source, refs: owed.join(', ') })] : []), ...paid.flatMap((p) => ('said' in p.pinned ? p.pinned.said : [say('resolved', { source: p.source, by: source, pin: p.pinned.pin })])),
    ...pinned.lines.filter((l) => l.scope === `${v.region}/${source}` || (l.scope?.startsWith(`${v.keys}/${source}/`) && l.measure === v.scheme)).map((l) => canonical(l)),
    ...(picked === undefined ? [] : 'refused' in picked ? [say('not-landed', { why: picked.refused })] : picked.lines)] };
})().then((result) => ({ ...result, said: [...result.said, ...(reconcile ? redIn(context.lock)('connect/seconds', `connect/${source}`, started, context.machine()) : [])] }));

/** Stage one consented set, compile once, and admit compatible source pins only after current input checks. */
const receivedBatch = async (context: Context, place: string, sources: readonly { source: string; pin: string; document: Read & { at: string }; overlay?: Read }[], account: string): Promise<readonly string[]> => {
  const started = context.machine(), say = sayIn(context.lock), word = (k: string) => valueOf(context.lock, k), digest = digestIn(context.lock), v = vocabOf(context.lock);
  const lot: string[] = [], line: Line = (scope, measure, value, more = {}) => canonical({ at: 'policy:head/connect', by: 'target', form: 'alphabet', measure, role: 'writes', scope, value, ...more });
  const worlds = [...new Set(sources.flatMap(s => configuredProtocol.connection(s.document.bytes, s.source, s.overlay !== undefined, v)?.worlds ?? members(word('world/adopts'))))];
  const adoptedWorlds = await adopted(context, place, lines => context.landRoot(place, lines, account), line, worlds);
  if ('refused' in adoptedWorlds) return [say('not-landed', { why: adoptedWorlds.refused })];
  for (const s of sources) {
    context.files.lay(place, `${word('place/connected')}/${s.source}.${s.document.kind}`, s.document.bytes);
    if (s.overlay) context.files.lay(place, `${word('place/connected')}/${s.source}.overlay.${s.overlay.kind}`, s.overlay.bytes);
  }
  const held = await context.policy(place, true); if ('refused' in held) return [say('unsettled', { why: held.refused })];
  const inputs = () => [...new Set([...[word('place/connected'), word('place/worlds')].flatMap(dir => context.files.list(place, dir).map(name => `${dir}/${name}`)), ...held.lines.flatMap(l => l.scope?.startsWith('uses/') && l.needs ? [l.needs] : [])])].sort().map(at => `${at} ${digest(context.files.take(join(place, at)) ?? '')}`);
  const read = inputs(), base = digest(held.lines.map(l => canonical(l)).sort().join('\n'));
  let views: readonly string[];
  try { views = compileViews(context, place, held.lines); } catch (error) { return [say('unsettled', { why: String(error) })]; }
  const results = context.worlds ? await context.worlds(place, views) : await Promise.all(views.map(view => context.world(place, view)));
  const compiled = new Map(views.map((view, i) => [view, results[i]!]));
  const refusal = results.find(result => 'refused' in result); if (refusal && 'refused' in refusal) return [say('unsettled', { why: refusal.refused })];
  if (JSON.stringify(inputs()) !== JSON.stringify(read)) throw Error('receive/inputs-changed');
  // Staging acknowledgments are private to preparation; no success is returned until the real native lot lands.
  const staged: Context = { ...context, files: { ...context.files, lay: (p, rel, bytes) => {
    if (read.some(row => row.startsWith(rel + ' '))) { if (digest(context.files.take(join(p, rel)) ?? '') !== digest(bytes) || !read.includes(`${rel} ${digest(bytes)}`)) throw Error('receive/inputs-changed'); return; }
    context.files.lay(p, rel, bytes);
  } }, policy: async () => held, world: async (_place, view) => compiled.get(view) ?? { refused: 'world/compile-unprepared' }, landRoot: async (_place, lines) => { lot.push(...lines); return { lines: [] }; } };
  const prepare = laidIn(staged, place, account, false, read), said: string[] = [];
  for (const s of sources) {
    const result = await prepare(s.source, s.document.at, s.document, s.overlay, started);
    if (!result.connected) return result.said;
    said.push(...result.said);
  }
  const pins = new Map<string, Awaited<ReturnType<ReturnType<typeof pinIn>>>>();
  const pin = pinIn(staged, place, lines => staged.landRoot(place, lines, account), line);
  const unrelated = { ...staged, policy: async () => ({ lines: held.lines.filter(l => !sources.some(s => l.scope === `uses/${s.source}`)) }) };
  for (const s of sources) for (const paid of await paidBy(unrelated, place, async (source, reading) => {
    if (!pins.has(source)) pins.set(source, await pin(source, [...reading, ...read])); return pins.get(source)!;
  }, `${word('place/connected')}/${s.source}.${s.document.kind}`)) if ('said' in paid.pinned) return paid.pinned.said;
  const current = await context.policy(place, true);
  if ('refused' in current || digest(current.lines.map(l => canonical(l)).sort().join('\n')) !== base || JSON.stringify(inputs()) !== JSON.stringify(read)) throw Error('receive/inputs-changed');
  const result = await context.landRoot(place, [...new Set(lot)], account);
  return 'refused' in result ? [say('not-landed', { why: result.refused })] : [...said, ...sources.flatMap(s => redIn(context.lock)('connect/seconds', `connect/${s.source}`, started, context.machine()))];
};
