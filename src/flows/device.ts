import { placeNameOf } from '../core/answer.ts';
import type { Context, Outcome } from '../core/answer.ts';
import { canonical, parse } from '@lapxo/topos/wire';
import { deviceOf, idIn, uncoveredIn } from '../core/device.ts';
import { newKey, publicOf } from '../core/keys.ts';
import { members, valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import { fill, sayIn } from '../core/surface.ts';
import { adoptsIn } from '../adopt/adopt.ts';

/** A key of this device by its role: read from the keychain, or made there once; only its public half is ever handed on. */
export const deviceKey = (context: Context, role?: string): string | undefined => ((account) => {
  const held = context.keys.read(account);
  const secret = held ?? ((made) => { context.keys.write(account, made.secret); return context.keys.read(account) === made.secret ? made.secret : undefined; })(newKey());
  return secret === undefined ? undefined : publicOf(secret);
})(deviceOf(context.lock, role).account);

/** The keychain account of a place's root, when this keychain holds it — who configures the place is here; else what head says of that. */
export const rootIn = (context: Context, place: string): { readonly account: string } | { readonly said: readonly string[] } =>
  ((account) => (context.keys.read(account) === undefined ? { said: [sayIn(context.lock)('no-root', { place })] } : { account }))(fill(valueOf(context.lock, 'founding/root-account'), { place: placeNameOf(place) }));

/**
 * Who signs a widening of a place: its root, when this keychain holds it and the place admits this device's person to
 * witness it — the line is then the place's own policy, in its lock, binding every device it admits, and names as its
 * witness the person who said yes, by the key the place knows them by; else this device's person key, when the place
 * admits it for every line — an attestation only this device reads, once per scope and measure the place does not state,
 * since a second needs a fold bound does not publish; else no one here, and the lines are handed on. A place that pins a
 * lock as its parent has nothing signed here: what the parent would cut is bound's to judge.
 */
type By = { readonly sign: (lot: readonly string[]) => Promise<Outcome>; readonly land: (lot: readonly string[]) => Promise<Outcome> };
export const widening = (context: Context, place: string, lines: readonly Said[], lot: readonly string[]): By | { readonly said: readonly string[] } => {
  const parent = adoptsIn(context.lock, lines);
  if (parent !== undefined) return { said: [sayIn(context.lock)('parent-lock', { place, parent })] };
  const [root, witness, field] = [rootIn(context, place), idIn(lines, context.device('person')), valueOf(context.lock, 'widening/witness')];
  const wire = lines.filter((l) => l.scope === 'wire/fields');
  const witnessed = (signed: readonly string[]) => signed.map((line) => ((got) => (got.kind === 'fact' ? canonical({ ...got.value.fields, [field]: witness! }) : line))(parse(line)));
  if ('account' in root && witness !== undefined) {
    if (wire.some((l) => members(l.value ?? '').includes(field))) return { sign: (signed) => context.signRoot(place, witnessed(signed), root.account), land: (signed) => context.landRoot(place, witnessed(signed), root.account) };
    if (lot.every((line) => / scope=wire\/fields /.test(line))) return { sign: (signed) => context.signRoot(place, signed, root.account), land: (signed) => context.landRoot(place, signed, root.account) };
    const [named, bare] = [[...new Set([...wire.flatMap((l) => members(l.value ?? '')), field])].join('|'), (l: Said) => Object.fromEntries(Object.entries(l).filter(([k]) => !['sig', 'epoch'].includes(k)))];
    return { said: [sayIn(context.lock)('unwitnessed', { place }), ...wire.map((l) => canonical({ ...bare(l), by: 'target', value: 'withdraw' })),
      canonical({ at: `policy:head/wire/${new Date(context.now()).toISOString()}`, by: 'target', form: 'alphabet', measure: 'id', role: 'reads', scope: 'wire/fields', value: named })] };
  }
  const stopped = uncoveredIn(context.lock, lines, context.device('person'), place, lot);
  if (stopped) return { said: stopped };
  const again = lot.flatMap((line) => ((got) => (got.kind === 'fact' && lines.some((l) => l.scope === got.value.fields.scope && l.measure === got.value.fields.measure) ? [got.value.fields.scope ?? ''] : []))(parse(line)))[0];
  return again !== undefined ? { said: [sayIn(context.lock)('attested-again', { place, scope: again })] } : { sign: (signed) => context.signAs(place, signed, 'person', lines), land: (signed) => context.landAs(place, signed, 'person', lines) };
};
