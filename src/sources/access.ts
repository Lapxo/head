import { inPlace, placeNameOf } from '../core/answer.ts';
import type { Asked, Context } from '../core/answer.ts';
import { uncoveredIn } from '../core/device.ts';
import { valueOf } from '../core/lock.ts';
import { planRead, vocabOf } from '../core/read.ts';
import type { Call } from '../core/read.ts';
import type { Attachment } from '../access/contract.ts';
import { sayIn } from '../core/surface.ts';
import { attachmentFor } from '../access/obtain.ts';
import { pickedOrigin } from '../flows/call.ts';
import { standingFor } from '../flows/world.ts';

/**
 * Access to a source obtained ahead of any call, at the origin the person picked once where several are declared: the
 * way its document says access is proven, run by the adapter of
 * that kind — the person's own page, or the provider they are sent to with a client registered for the visit — its
 * secret kept in this keychain and its obtaining landed as a receipt the device key signs. Nothing is called. What it
 * attaches is what a fetch made as that source carries, to that source's own origin alone.
 */
export const accessed = (asked: Asked, context: Context): Promise<readonly string[]> => inPlace(asked, context, async (place) => {
  let retry = false;
  if (asked['args']) { try { const args = JSON.parse(asked['args']); if (!args || Array.isArray(args) || typeof args !== 'object' || Object.keys(args).some(key => key !== 'retry') || (args.retry !== undefined && typeof args.retry !== 'boolean')) throw Error(); retry = args.retry === true; } catch { return [sayIn(context.lock)('access-arguments')]; } }
  const got = await attachedFor(context, place, asked['source'] ?? '', asked['operation'], retry);
  return 'said' in got ? got.said : [sayIn(context.lock)(got.plan.access.account === undefined ? 'access-anonymous' : 'access-kept', { source: got.plan.source })];
});

export const attachedFor = async (context: Context, place: string, source: string, asked?: string, retry = false): Promise<{ readonly plan: Call; readonly attachment: Attachment | undefined } | { readonly said: readonly string[] }> => {
  const [say, v] = [sayIn(context.lock), vocabOf(context.lock)];
  const held = await standingFor(context, place);
  if ('unsettled' in held) return { said: [say('unsettled', { source, why: held.unsettled })] };
  const operation = asked || held.lines.filter((l) => l.measure === v.class && l.value === v.callable && l.scope?.startsWith(`${v.offers}/${source}/`)).map((l) => l.scope!.split('/').slice(2).join('/')).sort()[0];
  if (operation === undefined) return { said: [say('unread', { source })] };
  const picked = await pickedOrigin(context, place, held.lines, source, planRead(held.lines, context.lock, source, operation, placeNameOf(place)));
  if ('said' in picked) return picked;
  const plan = planRead(picked.lines, context.lock, source, operation, placeNameOf(place));
  if (plan.kind === 'said') return { said: [say(plan.key, plan.fields)] };
  const stopped = uncoveredIn(context.lock, held.lines, context.device('head'), place, [], [`${valueOf(context.lock, 'access/family')}/${source}/${plan.access.scheme || v.anonymous}/obtained`]);
  if (stopped) return { said: stopped };
  const got = await attachmentFor(context, place, picked.lines, plan, retry);
  return 'said' in got ? { said: [say(got.said, { source, operation, kinds: plan.access.kind, input: got.input })] } : { plan, attachment: got.attachment };
};
