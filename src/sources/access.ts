import { inPlace, placeNameOf } from '../core/answer.ts';
import type { Asked, Context } from '../core/answer.ts';
import { uncoveredIn } from '../core/device.ts';
import { valueOf } from '../core/lock.ts';
import { planRead, vocabOf } from '../core/read.ts';
import { sayIn } from '../core/surface.ts';
import { attachmentFor } from '../access/obtain.ts';
import { pickedOrigin } from '../flows/call.ts';
import { standingFor } from '../flows/world.ts';

/**
 * Access to a source obtained ahead of any call, at the origin the person picked once where several are declared: the
 * way its document says access is proven, run by the adapter of
 * that kind — the person's own page, or the provider they are sent to with a client registered for the visit — its
 * secret kept in this keychain and its obtaining landed as a receipt the device key signs. Nothing is called.
 */
export const accessed = (asked: Asked, context: Context): Promise<readonly string[]> => inPlace(asked, context, async (place) => {
  const [say, v, source] = [sayIn(context.lock), vocabOf(context.lock), asked['source'] ?? ''];
  const held = await standingFor(context, place);
  if ('unsettled' in held) return [say('unsettled', { source, why: held.unsettled })];
  const operation = asked['operation'] || held.lines.filter((l) => l.measure === v.class && l.value === v.callable && l.scope?.startsWith(`${v.offers}/${source}/`)).map((l) => l.scope!.split('/').slice(2).join('/')).sort()[0];
  if (operation === undefined) return [say('unread', { source })];
  const picked = await pickedOrigin(context, place, held.lines, source, planRead(held.lines, context.lock, source, operation, placeNameOf(place)));
  if ('said' in picked) return picked.said;
  const plan = planRead(picked.lines, context.lock, source, operation, placeNameOf(place));
  if (plan.kind === 'said') return [say(plan.key, plan.fields)];
  const stopped = uncoveredIn(context.lock, held.lines, context.device('head'), place, [], [`${valueOf(context.lock, 'access/family')}/${source}/${plan.access.scheme || v.anonymous}/obtained`]);
  if (stopped) return stopped;
  const got = await attachmentFor(context, place, picked.lines, plan);
  return 'said' in got ? [say(got.said, { source, operation, kinds: plan.access.kind, input: got.input })] : [say(plan.access.account === undefined ? 'access-anonymous' : 'access-kept', { source })];
});
