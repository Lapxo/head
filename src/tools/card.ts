import { authorityFor } from '../flows/plan.ts';
import { inStanding, inPlace, printedOr } from '../core/answer.ts';
import type { Answer } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';

/** What is open for a key: the cells view the place's standing declares, as bound folded it at the resolution asked, narrowed to the key; a refused fold is said, never read as no view. The standing is the one the card was read off, folded once a call. */
export const answer: Answer = (asked, context) => asked['lines'] !== undefined || asked['preflight'] !== undefined || asked['authority'] !== undefined ? inPlace(asked, context, async place => (await authorityFor(context, place, asked['key'] ?? '', asked['preflight'] ?? 'record-coverage', (asked['lines'] ?? '').split('\n').filter(Boolean), true, asked['authority']))!) : inStanding(asked, context, async (place, lines) => {
  const word = (scope: string): string => valueOf(context.lock, `bound/${scope}`);
  const view = lines.find((f) => f.scope?.startsWith('view/') && !f.shape && members(f.value ?? '').includes(word('cells')));
  if (view === undefined) return [sayIn(context.lock)('no-cells', { place })];
  return printedOr(context, await context.bound(place, [word('read'), word('view'), `${view.scope!.split('/')[1]!}${asked['at'] ? `${word('at')}${asked['at']}` : ''}`, ...(asked['key'] ? [word('key'), asked['key']] : [])]));
});
