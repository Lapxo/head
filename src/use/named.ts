import { canonical } from '@lapxo/topos/wire';
import { inPlace, type Asked, type Context } from '../core/answer.ts';
import { valueOf, type Said } from '../core/lock.ts';
import { vocabOf, type Call, type Plan } from '../core/read.ts';
import { sayIn } from '../core/surface.ts';
import { called, type Frame } from '../flows/call.ts';
import { standingFor } from '../flows/world.ts';

/** The words of a name as a person or a model says it: its runs of letters and digits, lowercase. */
const words = (text: string): readonly string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** The offers of a source a place holds: head's own registry of it, local, never sent to the model whole. */
export const offersOf = (lock: readonly Said[], lines: readonly Said[], source: string): readonly string[] => ((at) => lines.filter((l) => l.measure === vocabOf(lock).class && l.scope?.startsWith(at)).map((l) => l.scope!.slice(at.length)))(`${vocabOf(lock).offers}/${source}/`);

/**
 * The offer a request names, read off head's registry: the use line of that name, else the offer of that very name, else
 * the offers whose name and path hold every word asked. One is the offer; several are the person's to choose in head's
 * form, shown to them and never to the model; with none, the call says the source offers no such operation, as before. An offer not yet used comes with its use line, named by the
 * request, at the person's at, unless one already names it; a read ahead names nothing new and asks nothing.
 */
export const namedIn = async (context: Context, lines: readonly Said[], source: string, asked: string, ahead: boolean): Promise<{ readonly operation: string; readonly use?: string; readonly scope?: string } | { readonly said: readonly string[] }> => {
  const [v, word, say] = [vocabOf(context.lock), (k: string) => valueOf(context.lock, k), sayIn(context.lock)];
  const [family, name] = [word('use/family'), words(asked).join('-')], uses = lines.filter((l) => l.scope?.startsWith(`${family}/${source}/`)), offers = offersOf(context.lock, lines, source);
  const used = uses.find((l) => l.scope === `${family}/${source}/${name}`)?.value;
  if (used !== undefined || ahead || !asked) return { operation: used ?? asked };
  const named = (op: string) => words([op, ...lines.filter((l) => l.scope === `${v.offers}/${source}/${op}/${v.carry}`).map((l) => l.value ?? '')].join(' '));
  const found = offers.includes(asked) ? [asked] : offers.filter((op) => words(asked).length > 0 && words(asked).every((w) => named(op).includes(w)));
  const operation = found.length > 1 ? (await context.person.choose(say('pick-offer', { source, asked }), [{ name: family, options: found.map((o) => ({ value: o, label: o })) }]))?.[family] : found[0];
  if (!found.length) return { operation: asked };
  if (operation === undefined || !found.includes(operation)) return { said: [say('pick-offer', { source, asked })] };
  const scope = `${family}/${source}/${name}`;
  return uses.some((l) => l.value === operation) ? { operation } : { operation, scope, use: canonical({ at: `${word('founding/person-at')}use/${new Date(context.now()).toISOString()}`, by: 'target', form: 'alphabet', measure: 'operation', role: 'writes', scope, value: operation }) };
};

/**
 * A call by the name its request gives: the offer read off head's registry, then the call as before, at that offer. Its
 * first land carries the use line the request named, where head's key covers it, signed with that receipt and kept out of
 * what the answer shows.
 */
export const calledByName = (asked: Asked, context: Context, planOf: (lines: readonly Said[], lock: readonly Said[], source: string, operation: string, place: string) => Call | Plan, then: (frame: Frame) => Promise<readonly string[]>): Promise<readonly string[]> => inPlace(asked, context, async (place) => {
  const held = await standingFor(context, place), family = valueOf(context.lock, 'use/family');
  const named = 'unsettled' in held ? { operation: asked['operation'] ?? '' } : await namedIn(context, held.lines, asked['source'] ?? '', asked['operation'] ?? '', asked['ahead'] === 'true');
  if ('said' in named) return named.said;
  return called({ ...asked, place, operation: named.operation }, context, planOf, (frame) => {
    let use = named.use !== undefined && frame.uncovered('head', [named.scope!]) === undefined ? [named.use] : [];
    return then({ ...frame, lands: (...lot) => ((once) => ((use = []), frame.lands(...once, ...lot).then((o) => ('lines' in o ? { lines: o.lines.filter((l) => !l.includes(` scope=${family}/`)) } : o))))(use) });
  });
});
