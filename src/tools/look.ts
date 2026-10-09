import { canonical } from '@lapxo/topos/wire';
import { inPlace, printedOr } from '../core/answer.ts';
import type { Answer } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import { vocabOf } from '../core/read.ts';
import { redIn, sayIn } from '../core/surface.ts';
import { readSource } from '../flows/read.ts';
import { standingFor } from '../flows/world.ts';

/**
 * One view of a place, folded by bound at the resolution asked; or, of a source, what it offers as typed lines — at the
 * first resolution where it is reached and each offer's class, by default its forms and how access is proven too, never
 * what only a transport reads — and, at the call resolution, one read of an offer of the class head reads. Each answer
 * is measured against answer/seconds and reads red past it, with the question it answered as its coordinate.
 */
export const answer: Answer = (asked, context) => ((started) => inPlace(asked, context, async (place) => {
  const word = (scope: string): string => valueOf(context.lock, scope);
  const source = asked['source'];
  if (source) {
    if (asked['operation'] && (asked['at'] === word('look/call') || asked['history'] === 'true')) return readSource(asked, context);
    const held = await standingFor(context, place);
    if ('unsettled' in held) return [sayIn(context.lock)('unsettled', { source, why: held.unsettled })];
    const [v, first, shallow] = [vocabOf(context.lock), (asked['at'] ?? word('look/default')) === '0', word('look/first').split('|')];
    const offer = `${v.offers}/${source}/${asked['operation'] ?? ''}`;
    const shown = held.lines.filter((l) => {
      const scope = l.scope ?? '';
      if (scope === `${v.region}/${source}`) return true;
      if (scope.startsWith(`${v.keys}/${source}/`)) return !first;
      const ofOffer = asked['operation'] ? scope === offer || scope.startsWith(`${offer}/`) : scope.startsWith(offer);
      if (!ofOffer || scope.endsWith(`/${v.carry}`)) return false;
      return !first || (!scope.endsWith(`/${v.form}`) && shallow.includes(l.measure ?? ''));
    });
    return shown.length ? shown.map((l) => canonical(l)).sort() : [sayIn(context.lock)('unread', { source })];
  }
  const view = `${asked['view'] || word('bound/standing')}${asked['at'] ? `${word('bound/at')}${asked['at']}` : ''}`;
  return printedOr(context, await context.bound(place, [word('bound/read'), word('bound/view'), view]));
}).then((lines) => [...lines, ...redIn(context.lock)('answer/seconds', `answer/${asked['source'] ? `${asked['source']}/${asked['operation'] ?? ''}` : asked['view'] || valueOf(context.lock, 'bound/standing')}@${asked['at'] ?? valueOf(context.lock, 'look/default')}`, started, context.machine())]))(context.machine());
