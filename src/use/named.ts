import { canonical } from '@lapxo/topos/wire';
import type { Context } from '../core/answer.ts';
import { valueOf, type Said } from '../core/lock.ts';
import { vocabOf } from '../core/read.ts';
import { sayIn } from '../core/surface.ts';

/** The words of a name as a person or a model says it: its runs of letters and digits, lowercase. */
const words = (text: string): readonly string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** The offers of a source a place holds: head's own registry of it, local, never sent to the model whole. */
export const offersOf = (lock: readonly Said[], lines: readonly Said[], source: string): readonly string[] => ((at) => lines.filter((l) => l.measure === vocabOf(lock).class && l.scope?.startsWith(at)).map((l) => l.scope!.slice(at.length)))(`${vocabOf(lock).offers}/${source}/`);

/** Resolve the offer against the local registry. Ambiguity asks the person; read-ahead creates no use line. */
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
