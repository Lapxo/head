import type { Context } from '../core/answer.ts';
import { readSource } from '../flows/read.ts';
import type { Cell } from '../ports/surface.ts';

const none = async () => 'none' as const, nothing = async () => undefined;

/**
 * What an answer leaves to do before the next call, done after it is answered; another call coming gives up what is not
 * begun, never what is, so no land is cut halfway:
 * the reads a known next asks for, read in a context that asks the person nothing — a read only, never an act, nothing it
 * would need a yes or a secret for — and then every place the answer names folded again where it moved, so the next
 * question finds it folded. A fold calls no source, so it spends nothing of a place's rate.
 */
export const readAhead = async (cells: readonly Cell[], context: Context, signal: AbortSignal): Promise<void> => {
  const quiet = { ...context, elicit: none, person: { consent: none, enter: nothing, choose: nothing, visit: nothing } } as unknown as Context;
  for (const { next } of cells) if (!signal.aborted && 'tool' in next && next.tool === 'ask' && next.args['source'] && next.args['operation'] && !next.args['why'] && !next.args['history']) await readSource({ ...next.args, ahead: 'true' }, quiet);
  await quiet.settle();
  for (const place of new Set(cells.flatMap((c) => [c.fields['place'] ?? '', 'tool' in c.next ? c.next.args['place'] ?? '' : '']).filter((p) => p && !signal.aborted))) await Promise.all([context.standing(place), context.policy(place)]).catch(() => undefined);
};
