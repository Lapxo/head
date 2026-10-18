import { inPlace, printedOr, standingOr } from '../core/answer.ts';
import type { Answer } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';

/** What is open for a key: the cells view the place's standing declares, as bound folded it at the resolution asked, narrowed to the key; a refused fold is said, never read as no view. The standing is the one the card was read off, folded once a call. */
export const answer: Answer = (asked, context) => inPlace(asked, context, async (place) => {
  const word = (scope: string): string => valueOf(context.lock, `bound/${scope}`);
  const held = await standingOr(context, place);
  if ('said' in held) return held.said;
  const view = held.lines.find((f) => f.scope?.startsWith('view/') && !f.shape && members(f.value ?? '').includes(word('cells')));
  if (view === undefined) return [sayIn(context.lock)('no-cells', { place })];
  return printedOr(context, await context.bound(place, [word('read'), word('view'), `${view.scope!.split('/')[1]!}${asked['at'] ? `${word('at')}${asked['at']}` : ''}`, ...(asked['key'] ? [word('key'), asked['key']] : [])]));
});
