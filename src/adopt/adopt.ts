import type { Context, Outcome } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import { linesOf } from '../core/worlds.ts';
import type { Line } from '../compile/pin.ts';

/**
 * What a place declares of a world it adopts, read off the world's own standing: each region that writes readings is a
 * reader, given the coordinates of what is connected when the place's view reads it — else of what was answered, when
 * only the view of answers does — and what it writes as its receipts. head names none of a world's regions.
 */
const readersOf = (lock: readonly Said[], standing: readonly Said[]): readonly { readonly scope: string; readonly measure: string; readonly value: string }[] => {
  const region = valueOf(lock, 'vocab/region');
  const reads = (view: string) => members(standing.find((l) => l.scope === `${region}/${valueOf(lock, view)}` && l.measure === 'reads')?.value ?? '');
  const [connected, answered] = [reads('place/view'), reads('place/answer')];
  return standing.filter((l) => l.scope?.startsWith(`${region}/`) && l.measure === 'writes' && l.role === 'writes').flatMap((l) => ((coordinates) => (coordinates
    ? [{ scope: l.scope!, measure: 'coordinates', value: coordinates }, { scope: l.scope!, measure: 'receipts', value: l.value! }] : []))(
    connected.includes(l.scope!) ? valueOf(lock, 'place/connected/coordinates') : answered.includes(l.scope!) ? valueOf(lock, 'place/answers/coordinates') : ''));
};

/**
 * Every world head adopts, once per place: its standing and blob pinned where they are published, for bound to
 * fetch and verify, and each of its readers told where head lays what it reads — read off the standing head reads from
 * the same address once per device, kept by its digest and answered only when it hashes to the pin. A world whose
 * standing cannot be read so is no adoption.
 */
export const adopted = async (context: Context, place: string, lands: (lot: readonly string[]) => Promise<Outcome>, line: Line): Promise<Outcome> => {
  const [word, held] = [(k: string) => valueOf(context.lock, k), await context.standing(place)];
  if ('refused' in held) return held;
  const own = held.lines, [wait, most] = ['adapter/request/wait', 'world/standing-bytes'].map((k) => Number(word(k).split('..')[1]));
  const lot: string[] = [];
  for (const w of members(word('world/adopts')).filter((w) => !own.some((l) => l.scope === `uses/${w}`))) {
    const [standing, blob, at, blobAt] = [word(`world/${w}/standing`), word(`world/${w}/blob`), word(`sources/${w}`), word(`sources/${w}-blob`)];
    const bytes = context.cache.held(standing) ?? ((got) => (got === undefined ? undefined : (context.cache.keep(got), got)))(await (await context.adapter(at))?.published(at, standing, most!, wait!));
    if (bytes === undefined) return { refused: `REFUSE·world ${w}: ${at} answered no bytes that hash to its pin ${standing}` };
    lot.push(line(`uses/${w}`, 'digest', standing), line(`sources/${w}`, 'id', at), line(`dep/${w}-blob`, 'digest', blob, { shape: word('world/shape') }), line(`sources/${w}-blob`, 'id', blobAt),
      ...readersOf(context.lock, linesOf(bytes)).map((r) => line(r.scope, r.measure, r.value, { role: 'reads' })));
  }
  return lot.length ? lands(lot) : { lines: [] };
};

/** The name of a lock the place pins as its parent, when it pins one: composing a parent's policy with a child's is bound's, so head reads nothing of such a place and signs nothing for it. */
export const adoptsIn = (lock: readonly Said[], lines: readonly Said[]): string | undefined =>
  lines.find((l) => l.scope?.startsWith('uses/') && l.needs?.startsWith(`${valueOf(lock, 'place/adopted')}/`))?.scope?.slice('uses/'.length);
