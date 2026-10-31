import { resolve } from 'node:path';
import { placeNameOf, homeIndex } from '../core/answer.ts';
import type { Context, Outcome } from '../core/answer.ts';
import { canonical, parse, LOCK } from '@lapxo/topos/wire';
import { deviceOf, idIn, uncoveredIn } from '../core/device.ts';
import { members, valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import { fill, sayIn } from '../core/surface.ts';
import { adoptsIn } from '../adopt/adopt.ts';

/** A key of this device by its role: read from the keychain, or made there once; only its public half is ever handed on. */
export const deviceKey = (context: Context, role?: string): string | undefined => context.keys.made?.(deviceOf(context.lock, role).account);

export { homeIndex } from '../core/answer.ts';

/** Resolve lexical path aliases through the authenticated index; a legacy folder name only locates a key whose public half must match the authenticated root. */
export const rootIn = async (context: Context, place: string): Promise<{ readonly account: string } | { readonly said: readonly string[] }> => {
  place = resolve(place);
  const home = resolve(context.home()), index = await homeIndex(context);
  if ('refused' in index) return { said: [sayIn(context.lock)(index.refused === 'index/invalid' ? 'index-invalid' : 'index-unread', { place: home })] };
  const names = [...new Set(index.lines.filter((l) => l.scope?.startsWith(`${valueOf(context.lock, 'home/family')}/`) && l.value !== undefined && l.value !== 'withdraw' && resolve(l.value) === place).map((l) => l.scope!.slice(valueOf(context.lock, 'home/family').length + 1)))];
  const name = place === home ? valueOf(context.lock, 'home/name') : names[0] ?? placeNameOf(place), account = fill(valueOf(context.lock, 'founding/root-account'), { place: name });
  const held = await context.policy(place), key = 'refused' in held ? undefined : held.lines.find((l) => l.scope === valueOf(context.lock, 'founding/root') && l.measure === 'public-key')?.value;
  if (names.length > 1) return { said: [sayIn(context.lock)('place-ambiguous', { names: names.sort().join('|') })] };
  return key === undefined || context.keys.held?.(account) !== key ? { said: [sayIn(context.lock)('no-root', { place })] } : { account };
};

/**
 * Who signs a widening of a place: its root, when this keychain holds it and the place admits this device's person to
 * witness it — the line is then the place's own policy, in its lock, binding every device it admits, and names as its
 * witness the person who said yes, by the key the place knows them by; else this device's person key, when the place
 * admits it for every line — an attestation only this device reads, once per scope and measure the place does not state,
 * since a second needs a fold bound does not publish; else no one here, and the lines are handed on. A place that pins a
 * lock as its parent has nothing signed here: what the parent would cut is bound's to judge.
 */
type By = { readonly key: string; readonly root: boolean; readonly records: (lot: readonly string[]) => readonly string[]; readonly sign: (lot: readonly string[]) => Promise<Outcome>; readonly land: (lot: readonly string[]) => Promise<Outcome> };
export const widening = async (context: Context, place: string, lines: readonly Said[], lot: readonly string[]): Promise<By | { readonly said: readonly string[] }> => {
  const parent = adoptsIn(context.lock, lines);
  if (parent !== undefined) return { said: [sayIn(context.lock)('parent-lock', { place, parent })] };
  const [root, witness, field] = [await rootIn(context, place), idIn(lines, context.device('person')), valueOf(context.lock, 'widening/witness')];
  const wire = lines.filter((l) => l.scope === 'wire/fields'), admits = wire.some((l) => members(l.value ?? '').includes(field));
  const witnessed = (signed: readonly string[]) => signed.map((line) => ((got) => (got.kind === 'fact' ? canonical({ ...got.value.fields, [field]: witness! }) : line))(parse(line)));
  if ('account' in root && witness !== undefined) {
    if (admits || lot.every((line) => / scope=wire\/fields /.test(line))) return { key: valueOf(context.lock, 'founding/root').split('/')[1]!, root: true, records: (signed) => admits ? witnessed(signed) : signed, sign: (signed) => context.signRoot(place, admits ? witnessed(signed) : signed, root.account), land: (signed) => context.landRoot(place, admits ? witnessed(signed) : signed, root.account) };
    const [named, bare] = [[...new Set([...wire.flatMap((l) => members(l.value ?? '')), field])].join('|'), (l: Said) => Object.fromEntries(Object.entries(l).filter(([k]) => !['sig', 'epoch'].includes(k)))];
    return { said: [sayIn(context.lock)('unwitnessed', { place }), ...wire.map((l) => canonical({ ...bare(l), by: 'target', value: 'withdraw' })),
      canonical({ at: `policy:head/wire/${new Date(context.now()).toISOString()}`, by: 'target', form: 'alphabet', measure: 'id', role: 'reads', scope: 'wire/fields', value: named })] };
  }
  const stopped = uncoveredIn(context.lock, lines, context.device('person'), place, lot);
  if (stopped) return { said: stopped };
  const again = lot.flatMap((line) => ((got) => (got.kind === 'fact' && lines.some((l) => l.scope === got.value.fields.scope && l.measure === got.value.fields.measure) ? [got.value.fields.scope ?? ''] : []))(parse(line)))[0];
  return again !== undefined ? { said: [sayIn(context.lock)('attested-again', { place, scope: again })] } : { key: witness!, root: false, records: (signed) => signed, sign: (signed) => context.signAs(place, signed, 'person', lines), land: (signed) => context.landAs(place, signed, 'person', lines) };
};
