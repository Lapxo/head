import { inPlace, placeNameOf, unless } from '../core/answer.ts';
import type { Asked, Context, Outcome } from '../core/answer.ts';
import type { Said } from '../core/lock.ts';
import { fieldsOf, vocabOf } from '../core/read.ts';
import type { Call, Plan } from '../core/read.ts';
import { canonical } from '@lapxo/topos/wire';
import { sayIn } from '../core/surface.ts';
import { valueOf } from '../core/lock.ts';
import { uncoveredIn } from '../core/device.ts';
import { widening } from './device.ts';
import type { Attachment } from '../access/contract.ts';
import type { Fetched, Prepared } from '../ports/adapters/request.ts';
import { attachmentFor } from '../access/obtain.ts';
import { typedAnswer } from './answer.ts';
import { standingFor } from './world.ts';

/**
 * The origin of a source a person picks once for a place, when its document declares several: offered as a choice among
 * them, none a default, and kept as the person's line; the lines a call stands on, with it.
 */
export const pickedOrigin = async (context: Context, place: string, lines: readonly Said[], source: string, plan: Call | Plan): Promise<{ readonly lines: readonly Said[] } | { readonly said: readonly string[] }> => {
  if (plan.kind !== 'said' || plan.key !== 'pick-origin') return { lines };
  const v = vocabOf(context.lock);
  const origins = fieldsOf(lines, `${v.region}/${source}`)[v.origins] ?? [];
  const line = (value: string): Said => ({ at: 'policy:person/picks', by: 'target', form: 'alphabet', measure: 'id', role: 'writes', scope: `${v.pick}/${source}`, value });
  const by = widening(context, place, lines, origins.map((o) => canonical(line(o))));
  if ('said' in by) return { said: by.said };
  const chosen = (await context.person.choose(sayIn(context.lock)('pick', { source }), [{ name: v.origin, options: origins.map((o) => ({ value: o, label: o })) }]))?.[v.origin];
  if (chosen === undefined || !origins.includes(chosen)) return { said: [sayIn(context.lock)(plan.key, plan.fields)] };
  const landed = await by.land([canonical(line(chosen))]);
  return 'refused' in landed ? { said: [sayIn(context.lock)('not-landed', { why: landed.refused })] } : { lines: [...lines, line(chosen)] };
};

const turns = new Map<string, Promise<unknown>>();
/** Calls of one place take turns, so one asked while another lands sees its receipt; nothing waits on a timer. */
export const inTurn = <T>(place: string, act: () => Promise<T>): Promise<T> => { const next = (turns.get(place) ?? Promise.resolve()).then(act, act); turns.set(place, next.catch(() => undefined)); return next; };

export interface Frame {
  readonly say: (key: string, fields?: Readonly<Record<string, string | undefined>>) => readonly string[]; readonly lands: (...lot: readonly string[]) => Promise<Outcome>; readonly most: (scope: string) => number;
  readonly place: string; readonly lines: readonly Said[]; readonly source: string; readonly operation: string; readonly plan: Call; readonly prepared: Extract<Prepared, { key: string }>;
  readonly widen: (message: string, lot: readonly string[]) => Promise<{ readonly lines: readonly string[] } | { readonly said: readonly string[] }>;
  readonly word: (scope: string) => string; readonly typed: (status: string, bytes: Uint8Array) => Promise<readonly string[]>; readonly attach: () => Promise<{ readonly attachment: Attachment | undefined; readonly principal: string | undefined } | { readonly said: readonly string[] }>;
  readonly send: (attachment: Attachment | undefined) => Promise<Fetched>;
  readonly uncovered: (role: string, scopes: readonly string[]) => readonly string[] | undefined;
}

/**
 * The steps a read and an act share: the place, its turn, the lines it stands on once bound settled them, the offer's
 * plan, the transport its origin names and the request it prepares; then what is particular, given a frame that says
 * by the lock, attaches access when asked, types what came back and lands a line under head's key.
 */
export const called = async (asked: Asked, context: Context, planOf: (lines: readonly Said[], lock: readonly Said[], source: string, operation: string, place: string) => Call | Plan, then: (frame: Frame) => Promise<readonly string[]>): Promise<readonly string[]> => {
  const say = (key: string, fields: Readonly<Record<string, string | undefined>> = {}) => [sayIn(context.lock)(key, fields)];
  const [source, operation] = [asked['source'] ?? '', asked['operation'] ?? ''];
  return inPlace(asked, context, (place) => inTurn(place, async () => {
    const held = await standingFor(context, place);
    if ('unsettled' in held) return say('unsettled', { source, why: held.unsettled });
    const widen = async (message: string, lot: readonly string[]) => {
      const by = widening(context, place, held.lines, lot);
      if ('said' in by) return { said: by.said };
      const refused = await unless(context, message);
      if (refused) return { said: refused };
      const landed = await by.land(lot);
      return 'refused' in landed ? { said: say('not-landed', { why: landed.refused }) } : { lines: landed.lines };
    };
    const picked = await pickedOrigin(context, place, held.lines, source, planOf(held.lines, context.lock, source, operation, placeNameOf(place)));
    if ('said' in picked) return picked.said;
    const lines = picked.lines;
    const plan = planOf(lines, context.lock, source, operation, placeNameOf(place));
    if (plan.kind === 'said') return say(plan.key, plan.fields);
    const prepared = ((transport) => transport?.prepare(plan, JSON.parse(asked['args'] || '{}') as Record<string, unknown>, context.lock))(await context.adapter(plan.origin));
    if (prepared === undefined) return say('no-transport', { source, origin: plan.origin });
    if ('missing' in prepared) return say('missing-param', { operation, param: prepared.missing });
    if ('refused' in prepared) return say(prepared.refused, { source, origin: plan.origin });
    const most = (scope: string) => Number((lines.find((l) => l.scope === scope)?.value ?? '0..0').split('..')[1]);
    const typed = async (status: string, bytes: Uint8Array) => ((got) => ['lines' in got ? say('answered', { source, operation, status })[0]! : say('untyped', { source, operation, status, why: got.untyped })[0]!, ...('lines' in got ? got.lines : [])])(await typedAnswer(context, place, lines, source, operation, prepared.key, bytes));
    const lands = (...lot: readonly string[]) => context.landAs(place, lot, 'head', lines);
    const attach = async () => ((got) => ('said' in got ? { said: say(got.said, { source, operation, kinds: plan.access.kind, input: got.input }) } : got))(await attachmentFor(context, place, lines, plan));
    const uncovered = (role: string, scopes: readonly string[]) => uncoveredIn(context.lock, lines, context.device(role), place, [], scopes);
    return then({ widen, word: (scope) => valueOf(context.lock, scope), say, place, lines, source, operation, plan, prepared, most, typed, attach, send: (attachment) => prepared.send(attachment, most('read/response-bytes')), lands, uncovered });
  }));
};
