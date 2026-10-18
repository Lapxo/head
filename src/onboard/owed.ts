import { canonical } from '@lapxo/topos/wire';
import { standingOr, type Asked, type Context } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { rootIn } from '../flows/device.ts';
import { laidIn } from '../sources/connect.ts';

/**
 * What a place founded on a first connect still owes: its source's document, by the address the person gave. Asked again,
 * it is read there; once it arrives, the source is connected from those bytes and pinned by their digest, the demand is
 * withdrawn and the question is answered. Until then it is not: what is owed is said, and nothing else is asked.
 */
export const paidIn = async (asked: Asked, context: Context, place: string): Promise<{ readonly said: readonly string[]; readonly answer: boolean }> => {
  const say = sayIn(context.lock), word = (k: string) => valueOf(context.lock, k), source = asked['source'] ?? '';
  const held = await standingOr(context, place), scope = `${word('place/needs')}/bytes/${source}`;
  const owed = 'said' in held ? undefined : held.lines.find((l) => l.scope === scope && l.role === 'demands' && l.value !== 'withdraw');
  if (owed === undefined) return { said: [], answer: true };
  const document = owed.value ?? '', read = await context.files.read.documentOf(context, place, document), root = rootIn(context, place);
  if ('said' in root) return { said: root.said, answer: false };
  if (read === undefined) return { said: [say('bytes-owed', { source, place, document })], answer: false };
  const laid = await laidIn(context, place, root.account)(source, document, read, undefined, context.machine());
  if (!laid.connected) return { said: laid.said, answer: false };
  const landed = await context.landRoot(place, [canonical({ ...Object.fromEntries(Object.entries(owed).filter(([k]) => !['sig', 'epoch'].includes(k))), by: 'target', value: 'withdraw' })], root.account);
  return 'refused' in landed ? { said: [...laid.said, say('not-landed', { why: landed.refused })], answer: false } : { said: [...laid.said, ...landed.lines], answer: true };
};
