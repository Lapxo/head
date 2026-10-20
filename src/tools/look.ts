import { canonical } from '@lapxo/topos/wire';
import { inPlace, printedOr } from '../core/answer.ts';
import type { Answer } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import { vocabOf } from '../core/read.ts';
import { redIn, sayIn } from '../core/surface.ts';
import { readSource } from '../flows/read.ts';
import { standingFor } from '../flows/world.ts';
import { trustOf } from '../core/trust.ts';

/**
 * A view of a place, folded by bound at the resolution asked; or the region of a source, or of one operation in it, as
 * typed lines at the resolution asked: at 0 where it is reached and each offer's class, past it their forms and access,
 * flows in the order of trust, never what only a transport reads. An operation asked no why is read once, if of the class
 * head reads; asked why, its region is followed by why its newest answer stands. Each answer reads red past answer/seconds
 * from the call's start, all head did for it included, with the question it answered as its coordinate.
 */
export const answer: Answer = (asked, context) => inPlace(asked, context, async (place) => {
  const word = (scope: string): string => valueOf(context.lock, scope);
  const source = asked['source'];
  if (source) {
    const [operation, why] = [asked['operation'], asked['why'] === 'true'];
    if (operation && !why) return readSource(asked, context);
    const held = await standingFor(context, place);
    if ('unsettled' in held) return [sayIn(context.lock)('unsettled', { source, why: held.unsettled })];
    const [v, first, shallow] = [vocabOf(context.lock), asked['at'] === '0', word('look/first').split('|')];
    const [region, uses] = [`${v.offers}/${source}/`, held.lines.filter((l) => l.scope?.startsWith(`${word('use/family')}/${source}/`))], named = operation ? [operation] : uses.map((l) => l.value ?? '');
    const shown = held.lines.filter((l) => {
      const scope = l.scope ?? '';
      if (scope === `${v.region}/${source}` || (!operation && uses.includes(l))) return true;
      if (scope.startsWith(`${v.keys}/${source}/`)) return !first;
      if (!named.some((op) => scope === `${region}${op}` || scope.startsWith(`${region}${op}/`)) || scope.endsWith(`/${v.carry}`)) return false;
      return !first || (!scope.endsWith(`/${v.form}`) && shallow.includes(l.measure ?? ''));
    }), more = held.lines.filter((l) => l.measure === v.class && l.scope?.startsWith(region) && !named.includes(l.scope.slice(region.length))).length;
    return shown.length ? [...shown.map((l) => canonical(l)).sort(), ...(first ? [] : trustOf(context.lock, held.lines, source)), ...(more ? [sayIn(context.lock)('more-offers', { source, more: String(more) })] : []), ...(operation ? await readSource(asked, context) : [])] : [sayIn(context.lock)('unread', { source })];
  }
  const view = `${asked['view'] ?? ''}${asked['at'] ? `${word('bound/at')}${asked['at']}` : ''}`;
  return printedOr(context, await context.bound(place, [word('bound/read'), word('bound/view'), view]));
}).then((lines) => [...lines, ...redIn(context.lock)('answer/seconds', `answer/${asked['source'] ? `${asked['source']}/${asked['operation'] ?? ''}` : asked['view'] ?? ''}`, context.begun, context.machine())]);
