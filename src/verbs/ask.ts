import { join } from 'node:path';
import { LOCK } from '@lapxo/topos/wire';
import { answerOf, placeOf } from '../core/answer.ts';
import type { Answer, Asked } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { paidIn } from '../onboard/owed.ts';
import { pendingIn } from '../sources/refused.ts';
import { cardAt } from './card.ts';

/**
 * What a person asks, answered by the question it is. A view, or the region of a source or of one operation in it (what
 * it offers, one read of it, why that answer stands, what was kept of it), is answered by look; drafted lines by plan;
 * what is open by card; anything else by places. Each form is read with no resolution unless the lock declares one for a
 * person; asked why, at the one it declares to explain, and where it declares none, the same answer, said so. Nothing
 * here writes one. An answer about one place ends with its card, taken off the fold the answer reads, valid from it.
 * With no place at all, nothing is founded: it says so, and that connecting an API founds the person's place, the question
 * carried along. A place still owing a source's bytes is answered only once they arrive.
 */
export const asked: Answer = async (asked, context) => {
  const why = asked['why'] === 'true', at = (form: string): string | undefined => valueOf(context.lock, `resolution/${form}/${why ? 'why' : 'person'}`) || undefined;
  const read = async (form: string, tool: string, more: Asked = {}): Promise<readonly string[]> => [...(why && at(form) === undefined ? [sayIn(context.lock)('why-undeclared', { form })] : []),
    ...await (await answerOf('tools', tool))({ ...asked, ...more, at: at(form) }, context)];
  const place = await placeOf(asked, context), founded = place !== undefined && context.files.has(place, LOCK), carded = asked['card'] === 'true';
  if (place === undefined && !carded && !context.files.has(context.home(), LOCK)) return [sayIn(context.lock)('unborn', { dir: join(context.personal(), valueOf(context.lock, 'first-run/folder')), source: asked['source'], operation: asked['operation'], args: asked['args'] })];
  const held = founded || carded ? await cardAt(context, place) : undefined;
  if (carded && held !== undefined && 'said' in held) return held.said;
  const owed = asked['source'] && founded ? await paidIn(asked, context, place!) : undefined;
  if (owed !== undefined && !owed.answer) return owed.said;
  const answer = asked['lines'] ? await read('plan', 'plan') : asked['view'] ? await read('view', 'look') : asked['source'] ? await read('offers', 'look')
    : !carded ? await read('places', 'places') : founded ? [...await read('card', 'card', { place }), ...await pendingIn(context, place!)] : [];
  const after = held === undefined || 'said' in held || place === undefined || !context.moved(place) ? held : await cardAt(context, place);
  return [...(owed?.said ?? []), ...answer, ...(after === undefined || 'said' in after ? [] : [sayIn(context.lock)('card', { place: place ?? '', card: after.card, from: 'ask' })])];
};
