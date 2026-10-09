import { extname, isAbsolute, resolve, sep } from 'node:path';
import { canonical, EXTENSION } from '@lapxo/topos/wire';
import { inPlace, unless } from '../core/answer.ts';
import type { Asked, Context } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import { vocabOf } from '../core/read.ts';
import { redIn, sayIn } from '../core/surface.ts';
import { digestIn } from '../core/worlds.ts';
import { paidBy, pinIn } from '../compile/pin.ts';
import { adopted } from '../adopt/adopt.ts';
import type { Line } from '../compile/pin.ts';
import { rootIn } from '../flows/device.ts';

/** The kind a document is named by, never read for: its file's extension, its address's, or the media type it was served as; bytes that say none are octet-stream. */
const kindOf = (at: string, type = ''): string => (extname(URL.canParse(at) ? new URL(at).pathname : at).slice(1)
  || (type.split(';')[0]!.split('/')[1] ?? '').split('+').at(-1)!.replace(/^x-/, '') || 'octet-stream').toLowerCase();

/** A document the person names: an encrypted address, or a file inside the place or a folder the client shares; anything else is not read. */
const documentOf = async (context: Context, place: string, at: string): Promise<{ readonly bytes: Uint8Array; readonly kind: string } | undefined> => {
  if (URL.canParse(at)) return ((got) => got && { bytes: got.bytes, kind: kindOf(at, got.type) })(await (await context.adapter(at))?.get(at, Number(valueOf(context.lock, 'adapter/request/wait').split('..')[1])));
  const inside = [place, ...(await context.roots())].some((root) => resolve(at).startsWith(`${resolve(root)}${sep}`));
  return ((bytes) => bytes && { bytes, kind: kindOf(at) })(isAbsolute(at) && inside ? context.files.take(at) : undefined);
};

/**
 * A source connected to a place, once the person said yes; a lock is no source, and adopting one as a parent is refused
 * by name, since composing two places' policies is bound's. A document — and an overlay beside it — is laid whatever its
 * kind, with every world head carries adopted, and the fold decides which reads it: what no world compiles is open, the
 * bytes taken back and the line that pays it handed on. What one does is compiled once per digest of what it read — the
 * same bytes again find their compiled standing by name — and pinned from the place's store: a new pin lands with the
 * old one's withdraw, said at its own time, since a withdrawn saying stays withdrawn.
 */
export const connected = (asked: Asked, context: Context): Promise<readonly string[]> => ((started) => inPlace(asked, context, async (place) => {
  const say = sayIn(context.lock), v = vocabOf(context.lock), word = (k: string) => valueOf(context.lock, k), digest = digestIn(context.lock);
  const [source, document] = [(asked['source'] ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-'), asked['document'] ?? ''];
  if (!source) return [say('missing-param', { operation: 'connect', param: 'source' })];
  if (`.${kindOf(document)}` === EXTENSION) return [say('parent-lock', { place, parent: source })];
  const root = rootIn(context, place);
  if ('said' in root) return root.said;
  const refused = await unless(context, say('elicit-connect', { source, document, place, overlay: asked['overlay'] ?? '' }));
  if (refused) return refused;
  const [doc, overlay] = [await documentOf(context, place, document), asked['overlay'] ? await documentOf(context, place, asked['overlay']) : undefined];
  if (doc === undefined || (asked['overlay'] && overlay === undefined)) return [say('document-unread', { document })];
  const lands = (lot: readonly string[]) => context.landRoot(place, lot, root.account);
  const line: Line = (scope, measure, value, more = {}) => canonical({ at: 'policy:head/connect', by: 'target', form: 'alphabet', measure, role: 'writes', scope, value, ...more });
  const pin = pinIn(context, place, lands, line);
  if (`.${doc.kind}` === EXTENSION) return [say('parent-lock', { place, parent: source })];
  const worlds = await adopted(context, place, lands, line);
  if ('refused' in worlds) return [say('not-landed', { why: worlds.refused })];
  const laid = [[`${word('place/connected')}/${source}.${doc.kind}`, doc.bytes] as const, ...(overlay ? [[`${word('place/connected')}/${source}.overlay.${overlay.kind}`, overlay.bytes] as const] : [])];
  for (const [at, bytes] of laid) context.files.lay(place, at, bytes);
  const pinned = await pin(source, laid.map(([at, bytes]) => `${at} ${digest(bytes)}`));
  if ('said' in pinned) {
    if (pinned.open || pinned.dropped) for (const [at] of laid) context.files.drop(place, at);
    return pinned.open ? [say('no-world', { kind: doc.kind, document }), line(`${word('place/needs')}/${doc.kind}`, 'id', valueOf(context.lock, 'birth/view/place'), { role: 'demands' })] : pinned.said;
  }
  const [owed, paid] = [pinned.lines.filter((l) => l.measure === v.unresolved).map((l) => l.value ?? ''), await paidBy(context, place, pin, laid[0]![0])];
  const classes = pinned.lines.filter((l) => l.measure === v.class && l.scope?.startsWith(`${v.offers}/${source}/`) && l.scope.split('/').length === 3);
  return [say('connected', { source, place, offers: String(classes.length), reads: String(classes.filter((l) => l.value === v.callable).length), pin: pinned.pin }),
    ...(owed.length ? [say('unresolved', { source, refs: owed.join(', ') })] : []), ...paid.flatMap((p) => ('said' in p.pinned ? p.pinned.said : [say('resolved', { source: p.source, by: source, pin: p.pinned.pin })])),
    ...pinned.lines.filter((l) => l.scope === `${v.region}/${source}` || (l.scope?.startsWith(`${v.keys}/${source}/`) && l.measure === v.scheme)).map((l) => canonical(l))];
}).then((lines) => [...lines, ...redIn(context.lock)('connect/seconds', `connect/${asked['source'] ?? ''}`, started, context.machine())]))(context.machine());
