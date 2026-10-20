import { members, valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import { readingOf } from '../ports/reading.ts';

/** What a place folded to, kept for this conversation under the reading it was folded from: one fold a reading and a kind. */
const kept = new Map<string, { readonly reading: string; readonly folded: Promise<unknown> }>();

/**
 * A place's fold, taken from what this conversation already folded where the place reads the same as then, and folded
 * otherwise. The reading is taken before the fold starts, so a place that moves while it folds is folded again next time.
 */
export const folded = <T>(lock: readonly Said[], kind: string, place: string, fold: () => Promise<T>): Promise<T> => {
  const [at, reading, held] = [`${kind}\0${place}`, readingOf(place, members(valueOf(lock, 'reading/apart')), valueOf(lock, 'reading/environment')), kept.get(`${kind}\0${place}`)];
  if (held?.reading === reading) return held.folded as Promise<T>;
  const folding = fold();
  kept.set(at, { reading, folded: folding });
  folding.catch(() => { if (kept.get(at)?.folded === folding) kept.delete(at); });
  return folding;
};
