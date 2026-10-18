import { canonical } from '@lapxo/topos/wire';
import { standingOr, type Context } from '../core/answer.ts';
import { valueOf, type Said } from '../core/lock.ts';
import type { Call } from '../core/read.ts';
import { sayIn } from '../core/surface.ts';
import { opened, sealed } from '../access/obtain.ts';

/** A read refused with the access head attached: its secret kept marked spent, never in a line, so the next call obtains it once; the refusal lands as a receipt without it. */
export const refusedAccess = async (context: Context, place: string, lines: readonly Said[], plan: Call, operation: string): Promise<readonly string[]> => {
  const [account, word] = [plan.access.account ?? '', (k: string) => valueOf(context.lock, k)], kept = opened(context.keys.read(account));
  if (kept !== undefined) context.keys.write(account, sealed({ ...kept, expires: 0 }));
  const landed = await context.landAs(place, [canonical({ at: `${word('receipt/at')}:${new Date(context.now()).toISOString()}`, by: 'target', form: 'alphabet', measure: 'status', role: 'writes', scope: `${word('access/family')}/${plan.access.flow}/refused`, value: 'present' })], 'head', lines);
  return [sayIn(context.lock)('access-refused', { source: plan.source, operation, place }), ...('lines' in landed ? landed.lines : [])];
};
/** The access a place was refused and has not obtained since, by its newest receipt: what its card shows as open. */
export const pendingIn = async (context: Context, place: string): Promise<readonly string[]> => ((held, family) => [...new Map(('said' in held ? [] : held.lines).filter((l) => l.scope?.startsWith(family) && /\/(refused|obtained|renewed|entered)$/.test(l.scope)).sort((a, b) => ((a.at ?? '') < (b.at ?? '') ? -1 : 1))
  .map((l) => [l.scope!.slice(family.length).replace(/\/[^/]+$/, ''), l.scope!.endsWith('/refused')] as const))].filter(([, refused]) => refused).map(([flow]) => sayIn(context.lock)('access-pending', { source: flow.split('/')[0], flow, place })))(await standingOr(context, place), `${valueOf(context.lock, 'access/family')}/`);
