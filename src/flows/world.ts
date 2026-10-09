import { join } from 'node:path';
import type { Context } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { pinnedOf } from '../core/worlds.ts';
import { adoptsIn } from '../adopt/adopt.ts';

/**
 * The lines a place stands on with what its sources compile to. A source the place pins is read from the standing it
 * pins, checked by hashing the bytes it holds — compiled once, never folded again; a file that no longer hashes to its pin
 * is no standing. A place that pins a lock as its parent stands on nothing head may read: composing the two is bound's, never head's. A place that pins none and names a view has bound compile it, asked once; a fold bound refused is no standing either.
 */
export const standingFor = async (context: Context, place: string): Promise<{ readonly lines: readonly Said[] } | { readonly unsettled: string }> => {
  const [held, view, compiled] = [await context.standing(place), valueOf(context.lock, 'place/view'), valueOf(context.lock, 'place/compiled')];
  if ('refused' in held) return { unsettled: held.refused };
  const own = held.lines;
  const parent = adoptsIn(context.lock, own);
  if (parent !== undefined) return { unsettled: sayIn(context.lock)('parent-lock', { place, parent }) };
  const pins = own.filter((l) => l.scope?.startsWith('uses/') && l.needs?.startsWith(`${compiled}/`)).map((l) => [l, pinnedOf(context.lock, context.files.take(join(place, l.needs!)))] as const);
  const moved = pins.find(([l, p]) => p?.pin !== l.value);
  if (moved) return { unsettled: sayIn(context.lock)('compiled-moved', { file: moved[0].needs }) };
  if (pins.length) return { lines: [...own, ...pins.flatMap(([, p]) => p!.lines)] };
  if (!own.some((line) => line.scope === `view/${view}`)) return { lines: own };
  const world = await context.world(place, view);
  return 'refused' in world ? { unsettled: world.refused } : { lines: [...own, ...world.lines] };
};
