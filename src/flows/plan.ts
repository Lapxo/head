import { baseOf, inPlace, standingOr } from '../core/answer.ts';
import type { Asked, Context } from '../core/answer.ts';
import { sayIn } from '../core/surface.ts';
import { widening } from './device.ts';
import { parse } from '@lapxo/topos/wire';
const moved = async (context: Context, place: string, base: string): Promise<readonly string[] | undefined> => ((now) => ('said' in now ? now.said : baseOf(now.lines) !== base ? [sayIn(context.lock)('base-moved', { base })] : undefined))(await standingOr(context, place));

/** Bound observes exact configuration records; Q4 domain checks remain in Head's existing card. */
export const authorityFor = async (context: Context, place: string, key: string, kind: string, records: readonly string[], observe = false, presented?: string): Promise<readonly string[] | undefined> => {
  const result = await context.authority(place, key, kind, records, presented), say = sayIn(context.lock);
  if ('refused' in result) return [say('authority-refused', { place, key, kind, why: result.refused, code: result.code })];
  return observe || result.decision !== 'allow' ? [say(observe ? 'authority-card' : result.decision === 'deny' ? 'authority-refused' : 'authority-needed', { place, key, kind, decision: result.decision, authority: result.authority, request: result.request, needs: result.needs.join('|'), why: result.decision })] : undefined;
};

/**
 * A proposal the person signs: drafted lines shown to the person with the place and the base they are made against; on
 * their yes to exactly those, signed by their key; what bound prints folding it as if landed comes back as it printed it. Nothing lands; the lot is kept by its digest.
 */
export const planLot = (asked: Asked, context: Context): Promise<readonly string[]> => inPlace(asked, context, async (place) => {
  const say = sayIn(context.lock);
  const lot = (asked['lines'] ?? '').split('\n').filter(Boolean);
  if (!lot.length || lot.some((line) => ((got) => got.kind !== 'fact' || got.value.fields['sig'] !== undefined || got.value.fields['by'] !== 'target')(parse(line)))) return [say('bad-lot')];
  const held = await standingOr(context, place);
  if ('said' in held) return held.said;
  const base = baseOf(held.lines);
  const by = await widening(context, place, held.lines, lot);
  if ('said' in by) return by.said;
  const initial = by.root ? await authorityFor(context, place, by.key, 'record-coverage', by.records(lot)) : undefined;
  if (initial) return initial;
  const consent = await context.elicit(say('elicit', { count: String(lot.length), place, base, lines: lot.join('\n') }));
  if (consent === 'none') return [say('sign-yourself', { place }), ...lot];
  if (consent === 'no') return [say('no-yes')];
  const signed = await by.sign(lot);
  if ('refused' in signed) return [signed.refused];
  const stale = await moved(context, place, base);
  if (stale) return stale;
  const kept = context.cache.keep(Buffer.from(JSON.stringify({ place, base, signed: signed.lines, root: by.root })));
  return [say('planned', { lot: kept, base }), ...(await context.told(place, signed.lines))];
});

/** A planned lot landed by its digest, only while the place stands on the base it was planned against. */
export const landLot = async (asked: Asked, context: Context): Promise<readonly string[]> => {
  const say = sayIn(context.lock);
  const bytes = context.cache.held(asked['lot'] ?? '');
  if (bytes === undefined) return [say('no-lot', { lot: asked['lot'] ?? '' })];
  const kept = JSON.parse(Buffer.from(bytes).toString('utf8')) as { place: string; base: string; signed: string[]; root?: boolean };
  const stale = await moved(context, kept.place, kept.base);
  if (stale) return stale;
  const author = parse(kept.signed[0] ?? '');
  const checked = kept.root ? await authorityFor(context, kept.place, author.kind === 'fact' ? author.value.fields.by ?? '' : '', 'admission', kept.signed) : undefined;
  if (checked) return checked;
  const landed = await context.land(kept.place, kept.signed);
  return 'refused' in landed ? [landed.refused] : [say('landed', { count: String(landed.lines.length) }), ...landed.lines];
};
