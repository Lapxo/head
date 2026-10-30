import { receiverQuestion } from '../core/receiver.ts';
import { join } from 'node:path';
import { LOCK } from '@lapxo/topos/wire';
import { answerOf, placeOf } from '../core/answer.ts';
import type { Answer, Asked } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { paidIn } from '../onboard/owed.ts';
import { pendingIn } from '../sources/refused.ts';
import { compared } from '../marks/compare.ts';
import { viewed } from '../claims/view.ts';
import { cardAt } from './card.ts';

/** Route a question at the declared resolution, then attach the card of the place it read. */
export const asked: Answer = async (asked, context) => {
  const packaged = await receiverQuestion(asked, context); if (packaged && 'said' in packaged) return packaged.said; if (packaged) asked = { ...asked, place: packaged.place };
  const why = asked['why'] === 'true', at = (form: string): string | undefined => ((v) => (v && v !== valueOf(context.lock, 'resolution/own') ? v : undefined))(valueOf(context.lock, `resolution/${form}/${why ? 'why' : 'person'}`));
  const read = async (form: string, tool: string, more: Asked = {}): Promise<readonly string[]> => [...(why && at(form) === undefined ? [sayIn(context.lock)('why-undeclared', { form })] : []),
    ...await (await answerOf('tools', tool))({ ...asked, ...more, at: at(form) }, context)];
  const place = await placeOf(asked, context), founded = place !== undefined && context.files.has(place, LOCK), carded = asked['card'] === 'true';
  if (place === undefined && !carded && !context.files.has(context.home(), LOCK)) return [sayIn(context.lock)('unborn', { dir: join(context.personal(), valueOf(context.lock, 'first-run/folder')), source: asked['source'], operation: asked['operation'], args: asked['args'] })];
  const held = founded || carded ? await cardAt(context, place) : undefined;
  if (carded && held !== undefined && 'said' in held) return held.said;
  const owed = asked['source'] && founded ? await paidIn(asked, context, place!) : undefined;
  if (owed !== undefined && !owed.answer) return owed.said;
  const answer = carded && (asked['lines'] !== undefined || asked['preflight'] !== undefined || asked['authority'] !== undefined) ? await read('card', 'card', { place }) : asked['sources'] && founded ? await compared(asked, context, place!) : asked['lines'] ? await read('plan', 'plan') : founded && asked['view'] === valueOf(context.lock, 'claim/view') ? await viewed(asked, context) : asked['view'] ? await read('view', 'look') : asked['source'] ? await read('offers', 'look')
    : !carded ? await read('places', 'places') : founded ? [...await read('card', 'card', { place }), ...await pendingIn(context, place!)] : [];
  const after = held === undefined || 'said' in held || place === undefined || !context.moved(place) ? held : await cardAt(context, place);
  return [...(owed?.said ?? []), ...answer, ...(after === undefined || 'said' in after ? [] : [sayIn(context.lock)('card', { place: place ?? '', card: after.card, from: 'ask' })])];
};
