import { answerOf, placeOf } from '../core/answer.ts';
import type { Answer } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { cardAt } from './card.ts';
import { LOCK } from '@lapxo/topos/wire';

/**
 * What a person does, carried out by the action it names and only on the card it was asked on: an act on a place that
 * moved since is refused before anything is done. An action the place does not allow is said not to be in the card, by
 * bound's own refusals, and by head's words for its own checks only until bound folds the card. The answer ends with the
 * card valid from this act: the same one where nothing but a read's receipts landed, folded again where more did.
 */
export const done: Answer = async (asked, context) => {
  const [say, word] = [sayIn(context.lock), (scope: string) => valueOf(context.lock, scope)];
  const action = asked['action'] ?? '';
  if (!members(word('do/actions')).includes(action)) return [say('unknown-action', { action, actions: word('do/actions') })];
  const place = await placeOf({ ...asked, place: asked['place'] || asked['dir'] }, context); if (typeof place === 'object') return place.said;
  const held = await cardAt(context, place);
  if ('said' in held) return held.said;
  if (held.card !== asked['card'] && !(action === 'place' && place !== undefined && !context.files.has(place, LOCK) && !context.files.has(place, '.bound'))) return [say('card-stale', { action, place: place ?? '', card: asked['card'] ?? '' })];
  const answer = await (await answerOf('tools', action))(asked, context);
  const [bound, own] = [members(word('do/not-in-card/bound')), members(word('do/not-in-card/head'))];
  const refusal = (line: string): string | undefined => ((r) => (r && [r[1]!, ...r[2]!.split(' ')].some((w) => bound.includes(w)) ? r[0] : undefined))(/REFUSE·([\w-]+)([^"]*)/.exec(line));
  const check = (line: string): string | undefined => ((c) => ((code) => (code && own.includes(code) ? `head/${code}` : undefined))(c?.[1] ?? c?.[2]))(/^said\/head\/([\w-]+) |head="head\/([\w-]+)"/.exec(line));
  const why = answer.map((line) => refusal(line) ?? check(line)).find(Boolean);
  const after = place === undefined || !context.moved(place) ? held : await cardAt(context, place);
  return [...(why === undefined ? [] : [say('not-in-card', { action, place: place ?? '', why })]), ...answer, ...(place === undefined || 'said' in after ? [] : [say('card', { place, card: after.card, from: `do ${action}` })])];
};
