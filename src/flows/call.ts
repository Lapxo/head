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
import { namedIn } from '../use/named.ts';
import { answering } from '../answers/answered.ts';
import type { Attachment } from '../access/contract.ts';
import type { Fetched, Prepared } from '../ports/adapters/request.ts';
import { attachmentFor } from '../access/obtain.ts';
import { typedAnswer } from './answer.ts';
import { standingFor } from './world.ts';

/** Ask for one declared origin when the source offers several. */
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

export interface Frame {
  readonly say: (key: string, fields?: Readonly<Record<string, string | undefined>>) => readonly string[]; readonly lands: (...lot: readonly string[]) => Promise<Outcome>; readonly most: (scope: string) => number;
  readonly place: string; readonly lines: readonly Said[]; readonly source: string; readonly operation: string; readonly plan: Call; readonly prepared: Extract<Prepared, { key: string }>;
  readonly widen: (message: string, lot: readonly string[]) => Promise<{ readonly lines: readonly string[] } | { readonly said: readonly string[] }>;
  readonly word: (scope: string) => string; readonly typed: (status: string, bytes: Uint8Array) => Promise<readonly string[]>; readonly attach: () => Promise<{ readonly attachment: Attachment | undefined; readonly principal: string | undefined } | { readonly said: readonly string[] }>;
  readonly send: (attachment: Attachment | undefined) => Promise<Fetched>;
  readonly uncovered: (role: string, scopes: readonly string[]) => readonly string[] | undefined;
}

/** Prepare one call, authorize its access and pass its frame to the read or action flow. */
export const called = async (asked: Asked, context: Context, planOf: (lines: readonly Said[], lock: readonly Said[], source: string, operation: string, place: string) => Call | Plan, then: (frame: Frame) => Promise<readonly string[]>): Promise<readonly string[]> => {
  const say = (key: string, fields: Readonly<Record<string, string | undefined>> = {}) => [sayIn(context.lock)(key, fields)];
  const source = asked['source'] ?? '';
  return inPlace(asked, context, async (place) => {
    const held = await standingFor(context, place);
    if ('unsettled' in held) return say('unsettled', { source, why: held.unsettled });
    const named = await namedIn(context, held.lines, source, asked['operation'] ?? '', asked['ahead'] === 'true');
    if ('said' in named) return named.said;
    const operation = named.operation;
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
    const typed = async (status: string, bytes: Uint8Array) => ((got, at) => ['lines' in got ? say('answered', { source, operation, status, at })[0]! : say('untyped', { source, operation, status, at, why: got.untyped })[0]!, ...('lines' in got ? got.lines : [])])(await typedAnswer(context, place, lines, source, operation, prepared.key, bytes), new Date(context.now()).toISOString());
    const attach = async () => ((got) => ('said' in got ? { said: say(got.said, { source, operation, kinds: plan.access.kind, input: got.input }) } : got))(await attachmentFor(context, place, lines, plan));
    const uncovered = (role: string, scopes: readonly string[]) => uncoveredIn(context.lock, lines, context.device(role), place, [], scopes);
    let use = named.use !== undefined && uncovered('head', [named.scope!]) === undefined ? [named.use] : [];
    const lands = (...lot: readonly string[]) => { const once = use; use = []; return context.landAs(place, [...once, ...lot], 'head', lines).then((out) => ('lines' in out ? { lines: out.lines.filter((l) => !l.includes(` scope=${valueOf(context.lock, 'use/family')}/`)) } : out)); };
    return then(answering(context, place, asked, { widen, word: (scope) => valueOf(context.lock, scope), say, place, lines, source, operation, plan, prepared, most, typed, attach, send: (attachment) => prepared.send(attachment, most('read/response-bytes')), lands, uncovered }));
  });
};
