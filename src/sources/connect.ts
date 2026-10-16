import { join } from 'node:path';
import { canonical, EXTENSION, LOCK } from '@lapxo/topos/wire';
import { inPlace, unless } from '../core/answer.ts';
import type { Asked, Context } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import { fieldsOf, vocabOf } from '../core/read.ts';
import { fill, redIn, sayIn } from '../core/surface.ts';
import { digestIn, linesOf } from '../core/worlds.ts';
import { unpacked } from '../core/package.ts';
import { paidBy, pinIn } from '../compile/pin.ts';
import { adopted } from '../adopt/adopt.ts';
import type { Line } from '../compile/pin.ts';
import { rootIn } from '../flows/device.ts';
import { bornAt } from '../places/found.ts';
import { untilOf } from '../core/act.ts';
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
export const connected = (asked: Asked, context: Context): Promise<readonly string[]> => (!asked['source'] && /^([a-z]+:\/\/)?[^/\s]+\/?$/.test(asked['document'] ?? '') ? used(asked, context) : ((started) => inPlace(asked, context, async (place) => {
  const say = sayIn(context.lock), digest = digestIn(context.lock), { documentOf, fetchedAs, kindOf } = context.files.read;
  const [source, document] = [(asked['source'] ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-'), asked['document'] ?? ''];
  const [via, named, accept, lock] = [asked['via'] ?? '', asked['digest'] ?? '', /^[\w.+-]+\/[\w.+-]+$/.test(asked['accept'] ?? '') ? asked['accept'] : undefined, `.${kindOf(document)}` === EXTENSION];
  if (lock && !named) return [say('parent-lock', { place, parent: source || document })];
  if (!source && !lock) return [say('missing-param', { operation: 'connect', param: 'source' })];
  const root = rootIn(context, place);
  if ('said' in root) return root.said;
  if (named && !/^sha256:[0-9a-f]{64}$/.test(named)) return [say('document-digest', { document, digest: named, got: '' })];
  if (lock) return ((read) => (read === undefined ? [say('document-unread', { document })] : digest(read.bytes) !== named ? [say('document-digest', { document, digest: named, got: digest(read.bytes) })]
    : received(context, place, document, read.bytes, named, laidIn(context, place, root.account))))(await documentOf(context, place, document, named));
  const refused = await unless(context, say('elicit-connect', { source, document, place, overlay: asked['overlay'] ?? '' }));
  if (refused) return refused;
  const got = via ? await attachedFor(context, place, via) : undefined;
  if (got && 'said' in got) return got.said;
  const [read, overlay] = [got ? await fetchedAs(context, document, via, got, named, accept) : await documentOf(context, place, document, named), asked['overlay'] ? await documentOf(context, place, asked['overlay']) : undefined];
  if (read !== undefined && 'said' in read) return read.said;
  if (read === undefined || (asked['overlay'] && overlay === undefined)) return [say('document-unread', { document })];
  if (named && digest(read.bytes) !== named) return [say('document-digest', { document, digest: named, got: digest(read.bytes) })];
  return `.${read.kind}` === EXTENSION ? [say('parent-lock', { place, parent: source })] : laidIn(context, place, root.account)(source, document, read, overlay, started);
}))(context.machine()));

const used = async (asked: Asked, context: Context): Promise<readonly string[]> => {
  const [say, word, until] = [sayIn(context.lock), (k: string) => valueOf(context.lock, k), untilOf(valueOf(context.lock, 'access/period'), context.now())], at = /^[a-z]+:\/\//.test(asked['document'] ?? '') ? asked['document']! : `${word('use/scheme')}//${asked['document'] ?? ''}`;
  if (!URL.canParse(at)) return [say('document-unread', { document: asked['document'] ?? '' })];
  const [origin, source] = [new URL(at).origin, new URL(at).hostname.replace(/[^a-z0-9-]+/g, '-')], dir = join(fill(word('use/folder'), { home: context.home() }), source);
  if (context.files.has(dir, LOCK)) return [say('use-held', { origin, dir })];
  const refused = await unless(context, say('elicit-use', { origin, dir, until }));
  if (refused) return refused;
  const born = await bornAt(context, dir, source), root = rootIn(context, dir), tried: string[] = [];
  if (born[0] !== say('born', { name: source, dir }) || 'said' in root) return 'said' in root ? [...born, ...root.said] : born;
  for (const document of await context.files.read.describedAt(context, origin)) {
    const read = await context.files.read.documentOf(context, dir, document);
    if (read === undefined || `.${read.kind}` === EXTENSION) { tried.push(document); continue; }
    const said = await laidIn(context, dir, root.account)(source, document, read, undefined, context.machine()), held = await context.policy(dir);
    if ('refused' in held || !held.lines.some((l) => l.scope === `uses/${source}`)) { tried.push(document); continue; }
    const line = (scope: string, measure: string, value: string, form = 'alphabet') => canonical({ at: 'policy:head/use', by: 'target', form, measure, role: 'writes', scope, value });
    const landed = await context.landRoot(dir, [line(`${word('allow/family')}/${source}`, 'calls', '0..0', 'interval'), line(word('grant/family'), 'sources', source), line(word('grant/family'), 'until', until)], root.account);
    return [say('used', { origin, dir, source, until }), ...said, ...('refused' in landed ? [say('not-landed', { why: landed.refused })] : landed.lines)];
  }
  return [...born, say('use-none', { origin, tried: tried.join(', ') || '—' })];
};

type Laid = (source: string, document: string, doc: Read, overlay: Read | undefined, started: number) => Promise<readonly string[]>;
const received = async (context: Context, place: string, document: string, bytes: Uint8Array, named: string, laid: Laid): Promise<readonly string[]> => {
  const [say, got] = [sayIn(context.lock), unpacked(context, document, bytes, await context.files.read.besideOf(context, document, linesOf(bytes)))];
  if (!got.sources) return got.said ?? [];
  const refused = await unless(context, say('elicit-receive', { place, package: named, sources: got.sources.map((s) => s.source).join(', ') }));
  if (refused) return refused;
  const said: string[] = [];
  for (const s of got.sources) said.push(...(await laid(s.source, s.document.at, s.document, s.overlay, context.machine())));
  const held = await context.policy(place), pinOf = (source: string) => ('refused' in held ? '' : held.lines.find((l) => l.scope === `uses/${source}`)?.value ?? '');
  const off = got.sources.filter((s) => pinOf(s.source) !== s.pin);
  return [...said, ...(off.length ? off.map((s) => say('package-pin', { source: s.source, pin: s.pin, got: pinOf(s.source) || 'none' })) : [say('received', { place, package: named, sources: got.sources.map((s) => s.source).join(', ') })])];
};
const laidIn = (context: Context, place: string, account: string): Laid => (source, document, doc, overlay, started) => (async () => {
  const say = sayIn(context.lock), v = vocabOf(context.lock), word = (k: string) => valueOf(context.lock, k), digest = digestIn(context.lock);
  const lands = (lot: readonly string[]) => context.landRoot(place, lot, account);
  const line: Line = (scope, measure, value, more = {}) => canonical({ at: 'policy:head/connect', by: 'target', form: 'alphabet', measure, role: 'writes', scope, value, ...more });
  const pin = pinIn(context, place, lands, line);
  const worlds = await adopted(context, place, lands, line);
  if ('refused' in worlds) return [say('not-landed', { why: worlds.refused })];
  const laid = [[`${word('place/connected')}/${source}.${doc.kind}`, doc.bytes] as const, ...(overlay ? [[`${word('place/connected')}/${source}.overlay.${overlay.kind}`, overlay.bytes] as const] : [])];
  for (const [at, bytes] of laid) context.files.lay(place, at, bytes);
  const pinned = await pin(source, laid.map(([at, bytes]) => `${at} ${digest(bytes)}`));
  if ('said' in pinned) {
    if (pinned.open || pinned.dropped) for (const [at] of laid) context.files.drop(place, at);
    return pinned.open ? [say('no-world', { kind: doc.kind, document }), line(`${word('place/needs')}/${doc.kind}`, 'id', valueOf(context.lock, 'birth/view/place'), { role: 'demands' })] : pinned.said;
  }
  const declared = fieldsOf(pinned.lines, `${v.region}/${source}`)[v.origins] ?? [], fetched = URL.canParse(document) && !declared.some((o) => URL.canParse(o)) && ((held) => 'lines' in held && !held.lines.some((l) => l.scope === `${v.pick}/${source}`))(await context.policy(place));
  const picked = fetched ? await lands([line(`${v.pick}/${source}`, 'id', new URL(declared[0] ?? '/', document).href.replace(/\/$/, ''))]) : undefined;
  const [owed, paid] = [pinned.lines.filter((l) => l.measure === v.unresolved).map((l) => l.value ?? ''), await paidBy(context, place, pin, laid[0]![0])];
  const classes = pinned.lines.filter((l) => l.measure === v.class && l.scope?.startsWith(`${v.offers}/${source}/`) && l.scope.split('/').length === 3);
  return [say('connected', { source, place, offers: String(classes.length), reads: String(classes.filter((l) => l.value === v.callable).length), pin: pinned.pin }),
    ...(owed.length ? [say('unresolved', { source, refs: owed.join(', ') })] : []), ...paid.flatMap((p) => ('said' in p.pinned ? p.pinned.said : [say('resolved', { source: p.source, by: source, pin: p.pinned.pin })])),
    ...pinned.lines.filter((l) => l.scope === `${v.region}/${source}` || (l.scope?.startsWith(`${v.keys}/${source}/`) && l.measure === v.scheme)).map((l) => canonical(l)),
    ...(picked === undefined ? [] : 'refused' in picked ? [say('not-landed', { why: picked.refused })] : picked.lines)];
})().then((lines) => [...lines, ...redIn(context.lock)('connect/seconds', `connect/${source}`, started, context.machine())]);
