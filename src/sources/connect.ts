import { join } from 'node:path';
import { canonical, EXTENSION } from '@lapxo/topos/wire';
import { inPlace, placeOf, unless } from '../core/answer.ts';
import type { Asked, Context } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import { fieldsOf, vocabOf } from '../core/read.ts';
import { redIn, sayIn } from '../core/surface.ts';
import { digestIn, linesOf } from '../core/worlds.ts';
import { coveredIn, owedIn, unpacked } from '../core/package.ts';
import { paidBy, pinIn } from '../compile/pin.ts';
import { adopted } from '../adopt/adopt.ts';
import type { Line } from '../compile/pin.ts';
import { firstRun } from '../onboard/first.ts';
import { resolved } from '../onboard/site.ts';
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
export const connected = async (asked: Asked, context: Context, covered = false): Promise<readonly string[]> => ((got) => ('said' in got ? got.said : connectedAs(got.asked, context, covered)))(await resolved(asked, context));
const connectedAs = async (asked: Asked, context: Context, covered = false): Promise<readonly string[]> => (asked['source'] && !(await placeOf(asked, context)) ? firstRun(asked, context, (dir, covered) => connected({ ...asked, place: dir }, context, covered))
  : ((started) => inPlace(asked, context, async (place) => {
  const say = sayIn(context.lock), digest = digestIn(context.lock), { documentOf, fetchedAs, kindOf } = context.files.read;
  const [source, document] = [(asked['source'] ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-'), asked['document'] ?? ''];
  const [via, named, accept, lock] = [asked['via'] ?? '', asked['digest'] ?? '', /^[\w.+-]+\/[\w.+-]+$/.test(asked['accept'] ?? '') ? asked['accept'] : undefined, `.${kindOf(document)}` === EXTENSION];
  if (lock && !named) return [say('parent-lock', { place, parent: source || document })];
  if (!source && !lock) return [say('missing-param', { operation: 'connect', param: 'source' })];
  const root = rootIn(context, place);
  if ('said' in root) return root.said;
  if (named && !/^sha256:[0-9a-f]{64}$/.test(named)) return [say('document-digest', { document, digest: named, got: '' })];
  if (lock) return ((read) => (read === undefined ? [say('document-unread', { document })] : digest(read.bytes) !== named ? [say('document-digest', { document, digest: named, got: digest(read.bytes) })]
    : received(context, place, document, read.bytes, named, laidIn(context, place, root.account), root.account)))(await documentOf(context, place, document, named));
  const refused = covered ? undefined : await unless(context, say('elicit-connect', { source, document, place, overlay: asked['overlay'] ?? '' }));
  if (refused) return refused;
  const got = via ? await attachedFor(context, place, via) : undefined;
  if (got && 'said' in got) return got.said;
  const [read, overlay] = [got ? await fetchedAs(context, document, via, got, named, accept) : await documentOf(context, place, document, named), asked['overlay'] ? await documentOf(context, place, asked['overlay']) : undefined];
  if (read !== undefined && 'said' in read) return read.said;
  if (read === undefined || (asked['overlay'] && overlay === undefined)) return [say('document-unread', { document })];
  if (named && digest(read.bytes) !== named) return [say('document-digest', { document, digest: named, got: digest(read.bytes) })];
  return `.${read.kind}` === EXTENSION ? [say('parent-lock', { place, parent: source })] : (await laidIn(context, place, root.account)(source, document, read, overlay, started)).said;
}))(context.machine()));

type Connection = { readonly said: readonly string[]; readonly connected: boolean };
type Laid = (source: string, document: string, doc: Read, overlay: Read | undefined, started: number) => Promise<Connection>;
const received = async (context: Context, place: string, document: string, bytes: Uint8Array, named: string, laid: Laid, account: string): Promise<readonly string[]> => {
  const [say, got] = [sayIn(context.lock), unpacked(context, document, bytes, await context.files.read.besideOf(context, document, linesOf(bytes)))];
  if (!got.sources) return got.said ?? [];
  const [names, said, before] = [got.sources.map((s) => s.source).join(', '), [] as string[], await context.policy(place)];
  const refused = coveredIn(context, 'refused' in before ? [] : before.lines, got.sources, named) ? undefined : await unless(context, say('elicit-receive', { place, package: named, sources: names || '—', open: (got.open ?? []).map((o) => o.source).join(', ') || '—' }));
  if (refused) return refused;
  for (const s of got.sources) said.push(...(await laid(s.source, s.document.at, s.document, s.overlay, context.machine())).said);
  const held = await context.policy(place), [pinOf, owed] = [(source: string) => ('refused' in held ? '' : held.lines.find((l) => l.scope === `uses/${source}`)?.value ?? ''), owedIn(context, 'refused' in held ? [] : held.lines, got.sources, got.open ?? [], named)];
  const [off, landed] = [got.sources.filter((s) => pinOf(s.source) !== s.pin), owed.length ? await context.landRoot(place, owed, account) : undefined];
  return [...said, ...(off.length ? off.map((s) => say('package-pin', { source: s.source, pin: s.pin, got: pinOf(s.source) || 'none' })) : names ? [say('received', { place, package: named, sources: names })] : []),
    ...(got.open ?? []).map((o) => say('received-open', { source: o.source, waits: o.waits })), ...(landed && 'refused' in landed ? [say('not-landed', { why: landed.refused })] : [])];
};
export const laidIn = (context: Context, place: string, account: string): Laid => (source, document, doc, overlay, started) => (async () => {
  const say = sayIn(context.lock), v = vocabOf(context.lock), word = (k: string) => valueOf(context.lock, k), digest = digestIn(context.lock);
  const lands = (lot: readonly string[]) => context.landRoot(place, lot, account);
  const line: Line = (scope, measure, value, more = {}) => canonical({ at: 'policy:head/connect', by: 'target', form: 'alphabet', measure, role: 'writes', scope, value, ...more });
  const pin = pinIn(context, place, lands, line);
  const worlds = await adopted(context, place, lands, line);
  if ('refused' in worlds) return { said: [say('not-landed', { why: worlds.refused })], connected: false };
  const laid = [[`${word('place/connected')}/${source}.${doc.kind}`, doc.bytes] as const, ...(overlay ? [[`${word('place/connected')}/${source}.overlay.${overlay.kind}`, overlay.bytes] as const] : [])];
  for (const [at, bytes] of laid) context.files.lay(place, at, bytes);
  const pinned = await pin(source, laid.map(([at, bytes]) => `${at} ${digest(bytes)}`));
  if ('said' in pinned) {
    if (pinned.open || pinned.dropped) for (const [at] of laid) context.files.drop(place, at);
    return { said: pinned.open ? [say('no-world', { kind: doc.kind, document }), line(`${word('place/needs')}/${doc.kind}`, 'id', valueOf(context.lock, 'birth/view/place'), { role: 'demands' })] : pinned.said, connected: false };
  }
  const declared = fieldsOf(pinned.lines, `${v.region}/${source}`)[v.origins] ?? [], fetched = URL.canParse(document) && !declared.some((o) => URL.canParse(o)) && ((held) => 'lines' in held && !held.lines.some((l) => l.scope === `${v.pick}/${source}`))(await context.policy(place));
  const picked = fetched ? await lands([line(`${v.pick}/${source}`, 'id', new URL(declared[0] ?? '/', document).href.replace(/\/$/, ''))]) : undefined;
  const [owed, paid] = [pinned.lines.filter((l) => l.measure === v.unresolved).map((l) => l.value ?? ''), await paidBy(context, place, pin, laid[0]![0])];
  const classes = pinned.lines.filter((l) => l.measure === v.class && l.scope?.startsWith(`${v.offers}/${source}/`) && l.scope.split('/').length === 3);
  return { connected: picked === undefined || !('refused' in picked), said: [say('connected', { source, place, offers: String(classes.length), reads: String(classes.filter((l) => l.value === v.callable).length), pin: pinned.pin }),
    ...(owed.length ? [say('unresolved', { source, refs: owed.join(', ') })] : []), ...paid.flatMap((p) => ('said' in p.pinned ? p.pinned.said : [say('resolved', { source: p.source, by: source, pin: p.pinned.pin })])),
    ...pinned.lines.filter((l) => l.scope === `${v.region}/${source}` || (l.scope?.startsWith(`${v.keys}/${source}/`) && l.measure === v.scheme)).map((l) => canonical(l)),
    ...(picked === undefined ? [] : 'refused' in picked ? [say('not-landed', { why: picked.refused })] : picked.lines)] };
})().then((result) => ({ ...result, said: [...result.said, ...redIn(context.lock)('connect/seconds', `connect/${source}`, started, context.machine())] }));
