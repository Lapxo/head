import { createHash } from 'node:crypto';
import { LOCK } from '@lapxo/topos/wire';
import { baseOf, standingOr } from '../core/answer.ts';
import type { Context } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';

/**
 * The card an act is made on: the place's standing as bound folds it, with the reads it kept set aside, and the keys this
 * device acts with. Anything landed, a grant withdrawn or a key admitted or changed moves it; a read never does. A folder
 * that holds no place yet has the card of nothing.
 */
export const cardAt = async (context: Context, place: string | undefined): Promise<{ readonly card: string } | { readonly said: readonly string[] }> => {
  const held = place === undefined || !context.files.has(place, LOCK) ? { lines: [] } : await standingOr(context, place);
  if ('said' in held) return held;
  const read = `${valueOf(context.lock, 'receipt/at')}:`, keys = ['head', 'person'].map((role) => context.device(role) ?? '');
  return { card: createHash('sha256').update([baseOf(held.lines.filter((l) => !l.at?.startsWith(read))), ...keys].join('\n')).digest('hex').slice(0, 16) };
};
