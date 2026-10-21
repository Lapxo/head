import { decodeReference } from '@lapxo/bound/reference';
import { canonical } from '@lapxo/topos/wire';
import { inPlace, standingOr, type Asked, type Context } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { linesOf } from '../core/worlds.ts';
import { rootIn } from '../flows/device.ts';

/**
 * A #bound: link connected: inspected by the instrument in the person's place, never authenticated — its bytes are the
 * link's, and nothing shows who shared it — and what it names is shown; nothing is connected or granted, since a package
 * is received by the digest its sharer sent apart. A place that admits no content transport is handed the lines that admit
 * one, to sign; bytes that do not arrive are owed by the link until they do; bytes that are not what it names are refused.
 * Asked why, it shows the transport it reads by: the profile's lines, laid at the place's birth by head, never the person's.
 */
export const linked = (asked: Asked, context: Context): Promise<readonly string[]> => inPlace(asked, context, async (place) => {
  const [say, word, link] = [sayIn(context.lock), (k: string) => valueOf(context.lock, k), asked['document'] ?? ''], [held, admits] = [await standingOr(context, place, context.policy), members(valueOf(context.lock, 'link/transport'))];
  if ('said' in held) return held.said;
  if (asked['why'] === 'true') return [...held.lines.filter((l) => admits.includes(l.scope ?? '') || l.scope?.startsWith('transport/')).map((l) => canonical(l)), say('why-transport', { place })];
  const lines = context.lock.filter((l) => admits.some((s) => l.scope === `birth/${s}`)).map(({ about: _about, scope, ...l }) => canonical({ ...l, scope: scope!.slice('birth/'.length), at: 'policy:person/transport', by: 'target' }));
  let reference: ReturnType<typeof decodeReference>;
  try { reference = decodeReference(link); } catch (refused) { return [say('link-refused', { link, why: refused instanceof Error ? refused.message : String(refused) })]; }
  if (![admits[0], `transport/${new URL(reference.source).protocol.slice(0, -1)}`].every((s) => held.lines.some((l) => l.scope === s))) return [say('transport-missing', { place, lines: lines.join('\n') })];
  const [printed, scope] = [await context.bound(place, [word('bound/read'), link]), `${word('place/needs')}/bytes/${reference.blob.slice(reference.algorithm.length + 1, reference.algorithm.length + 17)}`];
  const [owed, root, why] = [held.lines.find((l) => l.scope === scope && l.role === 'demands' && l.value === link), rootIn(context, place), printed?.err.filter((l) => !l.startsWith('{')).at(-1) ?? ''];
  if ('said' in root) return root.said;
  if (printed?.code !== 0 && !why.includes(word('link/unarrived'))) return [say('link-refused', { link, why })];
  const settled = (lot: readonly string[]) => (lot.length ? context.landRoot(place, lot, root.account).then((got) => ('refused' in got ? say('not-landed', { why: got.refused }) : got.lines)) : Promise.resolve([] as readonly string[]));
  const due = { at: 'policy:head/link', by: 'target', form: 'alphabet', measure: 'id', role: 'demands', scope, value: link };
  if (printed?.code !== 0) return [say('link-owed', { place, source: reference.source }), ...await settled(owed ? [] : [canonical(due)])];
  const named = linesOf(new TextEncoder().encode(printed.out.filter((l) => l.startsWith('TOPOS ')).map((l) => l.slice('TOPOS '.length)).join('\n')));
  const sources = named.filter((l) => /^sources\/[^/]+$/.test(l.scope ?? '')).map((l) => l.scope!.split('/')[1]!);
  return [say('inspected', { source: reference.source, sources: sources.join(', ') || '—', digest: reference.digest }), say('sharer-unverified', {}), ...await settled(owed ? [canonical({ ...due, value: 'withdraw' })] : [])];
});
