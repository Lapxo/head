import { baseOf, inPlace, standingOr } from '../core/answer.ts';
import type { Asked, Context } from '../core/answer.ts';
import { sayIn } from '../core/surface.ts';
import { widening } from './device.ts';
import { parse } from '@lapxo/topos/wire';

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
  const by = widening(context, place, held.lines, lot);
  if ('said' in by) return by.said;
  const consent = await context.elicit(say('elicit', { count: String(lot.length), place, base, lines: lot.join('\n') }));
  if (consent === 'none') return [say('sign-yourself', { place }), ...lot];
  if (consent === 'no') return [say('no-yes')];
  const signed = await by.sign(lot);
  if ('refused' in signed) return [signed.refused];
  const now = await standingOr(context, place);
  if ('said' in now) return now.said;
  if (baseOf(now.lines) !== base) return [say('base-moved', { base })];
  const kept = context.cache.keep(Buffer.from(JSON.stringify({ place, base, signed: signed.lines })));
  return [say('planned', { lot: kept, base }), ...(await context.told(place, signed.lines))];
});

/** A planned lot landed by its digest, only while the place stands on the base it was planned against. */
export const landLot = async (asked: Asked, context: Context): Promise<readonly string[]> => {
  const say = sayIn(context.lock);
  const bytes = context.cache.held(asked['lot'] ?? '');
  if (bytes === undefined) return [say('no-lot', { lot: asked['lot'] ?? '' })];
  const kept = JSON.parse(Buffer.from(bytes).toString('utf8')) as { place: string; base: string; signed: string[] };
  const now = await standingOr(context, kept.place);
  if ('said' in now) return now.said;
  if (baseOf(now.lines) !== kept.base) return [say('base-moved', { base: kept.base })];
  const landed = await context.land(kept.place, kept.signed);
  return 'refused' in landed ? [landed.refused] : [say('landed', { count: String(landed.lines.length) }), ...landed.lines];
};
