import { dirname, extname, join, relative, sep } from 'node:path';
import { canonical, LOCK, parse } from '@lapxo/topos/wire';
import { inPlace, standingOr, within, type Asked, type Context } from './answer.ts';
import { members, valueOf, type Said } from './lock.ts';
import { fieldsOf, vocabOf } from './read.ts';
import { sayIn } from './surface.ts';
import { digestIn, linesOf } from './worlds.ts';

/** A line no package carries: one that is not a world, or a source's document, overlay or pin, said once by digest — with, beside a digest that names bytes, the encrypted address they are read at. */
export const foreignIn = (lines: readonly Said[]): Said | undefined => lines.find((l) => !/^(sources\/[a-z0-9-]+(\/overlay)?|uses\/[a-z0-9-]+)$/.test(l.scope ?? '') || lines.some((o) => o !== l && o.scope === l.scope && o.measure === l.measure)
  || (l.measure !== 'digest' && !(l.measure === 'id' && URL.canParse(l.value ?? '') && lines.some((o) => o.scope === l.scope && o.measure === 'digest' && o.needs))));
const orderOf = <T extends { readonly source: string; readonly rests: readonly string[] }>(all: readonly T[], out: readonly T[] = []): readonly T[] | undefined => ((next) => (next === undefined ? (out.length === all.length ? out : undefined) : orderOf(all, [...out, next])))(all.find((s) => !out.includes(s) && s.rests.every((r) => out.some((o) => o.source === r))));
const packed = (context: Context, place: string, own: readonly Said[], urls: Readonly<Record<string, string>>) => {
  const [word, v, digest, held] = [(k: string) => valueOf(context.lock, k), vocabOf(context.lock), digestIn(context.lock), (rel: string) => context.files.take(join(place, rel)) ?? new Uint8Array()];
  const row = (scope: string, value: string, more: Readonly<Record<string, string>> = {}) => [canonical({ at: 'policy:head/share', by: 'target', form: 'alphabet', measure: 'digest', role: 'writes', scope, value, ...more }),
    ...(more['needs'] && URL.canParse(urls[more['needs']] ?? '') ? [canonical({ at: 'policy:head/share', by: 'target', form: 'alphabet', measure: 'id', role: 'writes', scope, value: urls[more['needs']]! })] : [])];
  const pins = own.filter((l) => l.scope?.startsWith('uses/') && l.needs?.startsWith(`${word('place/compiled')}/`)).map((l) => ((source) => ({ source, pin: l.value!, needs: l.needs!, lines: linesOf(held(l.needs!)), laid: context.files.read.laidOf(context, place, source) }))(l.scope!.slice('uses/'.length)));
  const declares = new Map(pins.flatMap((p) => (fieldsOf(p.lines, `${v.region}/${p.source}`)[v.issuers] ?? []).map((issuer) => [issuer, p.source] as const)));
  const rested = pins.map((p) => ({ ...p, rests: [...new Set(p.lines.filter((l) => l.measure === 'issuer').flatMap((l) => declares.get(l.value ?? '') ?? []))].filter((s) => s !== p.source).sort() })), sources = orderOf(rested) ?? rested;
  return { names: sources.map((s) => s.source), files: sources.flatMap((s) => [...s.laid, [s.needs, held(s.needs)] as const]), lines: [...own.filter((l) => members(word('world/adopts')).some((w) => l.scope === `uses/${w}`)).flatMap((l) => row(l.scope!, l.value!)),
    ...sources.flatMap((s) => [...s.laid.flatMap(([rel, bytes]) => row(/\.overlay\.[^.]+$/.test(rel) ? `sources/${s.source}/overlay` : `sources/${s.source}`, digest(bytes), { needs: rel })),
      ...row(`uses/${s.source}`, s.pin, { needs: s.needs, ...(s.rests.length ? { restsOn: s.rests.map((r) => `uses/${r}`).join('|') } : {}) })])] };
};
/** A place packed as its published lock would name it, into a folder inside it or one the client shares, apart from what head and bound keep: each world its sources were compiled under, and each source — document, overlay, and compiled pin resting on the sources whose issuers it names — by digest, beside the bytes those digests name, and where the person says they are also published, at that encrypted address. No line of access, key or grant: a package grants nothing, and nothing is asked, signed or landed. */
export const shared = (asked: Asked, context: Context): Promise<readonly string[]> => inPlace(asked, context, async (place) => {
  const [say, to, held] = [sayIn(context.lock), asked['to'] ?? '', await standingOr(context, place, context.policy)], [rel, there] = [relative(place, to), linesOf(context.files.take(join(to, LOCK)) ?? new Uint8Array())];
  if (!(await within(context, place, to)) || (!rel.startsWith('..') && (rel === '' || rel.startsWith('.') || rel.split(sep)[0] === valueOf(context.lock, 'place/connected'))) || foreignIn(there)) return [say('share-to', { place, to })];
  if ('said' in held) return held.said;
  const pack = packed(context, place, held.lines, ((u) => (u && typeof u === 'object' ? u : {}))((() => { try { return JSON.parse(asked['urls'] || '{}') as Record<string, string>; } catch { return {}; } })())), bytes = new TextEncoder().encode(`${pack.lines.join('\n')}\n`);
  return !pack.names.length ? [say('share-none', { place })] : ([...pack.files, [LOCK, bytes] as const].forEach(([at, laid]) => context.files.lay(to, at, laid)), [say('shared', { place, to, sources: pack.names.join(', '), digest: digestIn(context.lock)(bytes) }), ...pack.lines]);
});
/** What a package names, checked whole before anything is asked: every line a world or a source's document, overlay or pin, by digest; every byte it names, as read, hashing to its line; each world the one this head pins; an order its pins rest in. */
export const unpacked = (context: Context, document: string, bytes: Uint8Array, read: ReadonlyMap<string, Uint8Array | undefined>) => {
  const [say, word, digest, lines] = [sayIn(context.lock), (k: string) => valueOf(context.lock, k), digestIn(context.lock), linesOf(bytes)], said = lines.filter((l) => l.measure === 'digest'), at = (scope: string) => said.find((l) => l.scope === scope);
  const unread = new TextDecoder().decode(bytes).split('\n').find((l) => l && parse(l).kind !== 'fact'), name = (l: Said) => l.scope!.split('/')[1]!;
  const odd = unread === undefined ? foreignIn(lines) ?? said.find((l) => (l.scope!.startsWith('uses/') ? (l.needs ? !at(`sources/${name(l)}`)?.needs : !word(`world/${name(l)}/standing`))
    : !l.needs || !at(`uses/${name(l)}`)?.needs || l.needs.split('/').includes('..') || l.needs.startsWith('/'))) : { scope: unread.slice(0, 80) };
  if (odd) return { said: [say('package-line', { document, scope: odd.scope ?? '' })] };
  const world = said.find((l) => !l.needs && l.value !== word(`world/${name(l)}/standing`)), where = (l: Said) => lines.find((o) => o.scope === l.scope && o.measure === 'id')?.value ?? (URL.canParse(document) ? new URL(l.needs!, document).href : join(dirname(document), l.needs!));
  if (world) return { said: [say('package-world', { document, world: name(world), pin: world.value!, held: word(`world/${name(world)}/standing`) })] };
  const off = said.find((l) => l.needs && digest(read.get(l.needs) ?? '') !== l.value), of = (scope: string) => ((l) => l && { at: where(l), bytes: read.get(l.needs!)!, kind: extname(l.needs!).slice(1) })(at(scope));
  if (off) return { said: [read.get(off.needs!) === undefined ? say('document-unread', { document: where(off) }) : say('document-digest', { document: where(off), digest: off.value!, got: digest(read.get(off.needs!)!) })] };
  const order = orderOf(said.filter((l) => l.scope!.startsWith('uses/') && l.needs).map((l) => ({ source: name(l), pin: l.value!, rests: (l.restsOn ?? '').split('|').filter(Boolean).map((r) => r.slice('uses/'.length)) })));
  if (order === undefined) return { said: [say('package-line', { document, scope: 'restsOn' })] };
  return { sources: order.map((s) => ({ source: s.source, pin: s.pin, document: of(`sources/${s.source}`)!, ...((o) => (o ? { overlay: o } : {}))(of(`sources/${s.source}/overlay`)) })) };
};
