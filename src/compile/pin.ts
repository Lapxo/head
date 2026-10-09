import { basename, join } from 'node:path';
import { canonical, EXTENSION } from '@lapxo/topos/wire';
import type { Context, Outcome } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import { fieldsOf, vocabOf } from '../core/read.ts';
import { sayIn } from '../core/surface.ts';
import { digestIn, linesOf, pinnedOf } from '../core/worlds.ts';

export type Line = (scope: string, measure: string, value: string, more?: Readonly<Record<string, string>>) => string;
export type Pinned = { readonly pin: string; readonly lines: readonly Said[] } | { readonly said: readonly string[]; readonly open?: true; readonly dropped?: true };

/**
 * One compile, by the fold: the place view asked once, this source's lines kept with a region of its own — and the flow
 * of each issuer the source declares, so a flow is pinned once, by whoever declares it — and the standing bound selects
 * from them pinned and laid where its input names it.
 */
const compiledOf = async (context: Context, place: string, source: string, file: string): Promise<Pinned> => {
  const say = sayIn(context.lock), v = vocabOf(context.lock);
  const compiled = await context.world(place, valueOf(context.lock, 'place/view'));
  if ('refused' in compiled) return { said: [say('unsettled', { source, why: compiled.refused })] };
  const issued = (fieldsOf(compiled.lines, `${v.region}/${source}`)[v.issuers] ?? []).map((issuer) => `${v.keys}/${issuer}`);
  const mine = compiled.lines.filter((l) => l.scope === `${v.region}/${source}` || l.scope?.startsWith(`${v.keys}/${source}/`) || l.scope?.startsWith(`${v.offers}/${source}/`) || /^(read|write)\//.test(l.scope ?? '')
    || issued.some((at) => l.scope === at || l.scope?.startsWith(`${at}/`)));
  if (!mine.some((l) => !/^(read|write)\//.test(l.scope ?? ''))) return { said: [], open: true };
  const refused = (['unparsed', 'unsupported', 'collision'] as const).find((word) => fieldsOf(compiled.lines, `${v.region}/${source}`)[v[word]] !== undefined);
  if (refused) return { said: [say(`document-${refused}`, { source, why: fieldsOf(compiled.lines, `${v.region}/${source}`)[v[refused]]!.join('; ') })], dropped: true };
  if (!mine.some((l) => l.measure === v.class && l.scope?.split('/').length === 3)) return { said: [say('nothing-offered', { source })] };
  return drafted(context, place, source, file, [...mine.map((l) => canonical(l)), canonical({ at: 'policy:head/connect', by: 'target', form: 'alphabet', measure: 'reads', role: 'render', scope: `${v.region}/${source}`, value: [`${v.keys}/${source}/**`, ...issued.flatMap((at) => [at, `${at}/**`]), `${v.offers}/${source}/**|read/**|${v.region}/${source}|write/**`].join('|') })]);
};

const drafted = async (context: Context, place: string, source: string, file: string, lines: readonly string[]): Promise<Pinned> => {
  const say = sayIn(context.lock), draft = file.replace(new RegExp(`${EXTENSION.replace('.', '\\.')}$`), `.draft${EXTENSION}`);
  context.files.lay(place, draft, new TextEncoder().encode(`${lines.join('\n')}\n`));
  const pinned = await context.pinned(place, draft);
  context.files.drop(place, draft);
  if (pinned === undefined || 'refused' in pinned) return { said: [pinned === undefined ? say('nothing-offered', { source }) : say('unsettled', { source, why: pinned.refused })] };
  context.files.lay(place, file, new TextEncoder().encode(pinned.bytes));
  return { pin: pinned.pin, lines: pinned.lines };
};

/**
 * A source pinned in a place: compiled once per digest of what it read — the place's other pins and what was laid for it
 * — so the same input finds its compiled standing by name, and pinned from the place's store: a new pin lands with the old
 * one's withdraw, said at its own time, since a withdrawn saying stays withdrawn.
 */
export const pinIn = (context: Context, place: string, lands: (lot: readonly string[]) => Promise<Outcome>, line: Line) => async (source: string, read: readonly string[]): Promise<Pinned> => {
  const [say, digest, held] = [sayIn(context.lock), digestIn(context.lock), await context.standing(place)];
  if ('refused' in held) return { said: [say('unsettled', { source, why: held.refused })] };
  const own = held.lines;
  const input = digest([...own.filter((l) => l.scope?.startsWith('uses/') && l.scope !== `uses/${source}`).map((l) => `${l.scope} ${l.value}`), ...read].sort().join('\n'));
  const file = `${valueOf(context.lock, 'place/compiled')}/${source}/${input.split(':')[1]!.slice(0, 16)}${EXTENSION}`;
  const old = own.find((l) => l.scope === `uses/${source}`);
  const pinned = ((kept) => (kept !== undefined && kept.pin === old?.value ? kept : undefined))(pinnedOf(context.lock, old?.needs === file ? context.files.take(join(place, file)) : undefined)) ?? await compiledOf(context, place, source, file);
  if ('said' in pinned || (old?.needs === file && old.value === pinned.pin)) return pinned;
  const withdraw = old === undefined ? [] : [canonical({ ...Object.fromEntries(Object.entries(old).filter(([k]) => !['sig', 'epoch'].includes(k))), by: 'target', value: 'withdraw' })];
  const landed = await lands([...withdraw, line(`uses/${source}`, 'digest', pinned.pin, { needs: file, at: `policy:head/connect/${new Date(context.now()).toISOString()}` })]);
  return 'refused' in landed ? { said: [say('not-landed', { why: landed.refused })] } : pinned;
};

/**
 * The demands a document laid in a place pays: every other pin whose compile named a reference to it unresolved, as it
 * was not there yet, recompiled now that it is — the input its old pin read and the place's pins as they now stand — and
 * never reconnected. What each answers is said by the pin; one still unresolved stays a demand.
 */
export const paidBy = async (context: Context, place: string, pin: ReturnType<typeof pinIn>, laid: string): Promise<readonly { readonly source: string; readonly pinned: Pinned }[]> => {
  const [v, held] = [vocabOf(context.lock), await context.standing(place)];
  if ('refused' in held) return [];
  const owed = held.lines.filter((l) => l.scope?.startsWith('uses/') && l.needs?.startsWith(`${valueOf(context.lock, 'place/compiled')}/`)
    && linesOf(context.files.take(join(place, l.needs)) ?? new Uint8Array()).some((r) => r.measure === v.unresolved && basename((r.value ?? '').split('#')[0]!) === basename(laid)));
  const paid: { readonly source: string; readonly pinned: Pinned }[] = [];
  for (const l of owed) paid.push({ source: l.scope!.slice('uses/'.length), pinned: await pin(l.scope!.slice('uses/'.length), [`${l.scope} ${l.needs}`]) });
  return paid;
};
