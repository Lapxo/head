import { join } from 'node:path';
import { canonical, LOCK } from '@lapxo/topos/wire';
import type { Context, Outcome } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import { linesOf } from '../core/worlds.ts';
import { pinnedAs } from '../compile/pin.ts';

/**
 * A place made walkable once it is founded: the context another place authenticates it by — its wire, its keys and its
 * origin, read off the lines it was born with — folded by bound into a standing, laid beside its lock and pinned by its
 * root, so a peer selects it by digest. Its history is offered only as its walk view declares, and only when its own key walks it.
 */
export const walkable = async (context: Context, dir: string, account: string): Promise<Outcome> => {
  const [word, at] = [(k: string) => valueOf(context.lock, k), valueOf(context.lock, 'walk/context/file')];
  const reads = members(word('walk/context/reads'));
  const born = linesOf(context.files.take(join(dir, LOCK)) ?? new Uint8Array()).filter((l) => reads.some((r) => (r.endsWith('/**') ? l.scope?.startsWith(r.slice(0, -2)) : l.scope === r)) && l.value !== 'withdraw');
  const pinned = await pinnedAs(context, dir, at, [...born.map(({ sig: _s, epoch: _e, ...l }) => canonical({ ...l, by: 'target' } as Record<string, string>)),
    canonical({ at: 'policy:head/walk', by: 'target', form: 'alphabet', measure: 'reads', role: 'writes', scope: word('walk/context/region'), value: reads.join('|') })]);
  if (pinned === undefined || 'refused' in pinned) return { refused: pinned === undefined ? 'walk context folded nothing' : pinned.refused };
  return context.landRoot(dir, [canonical({ at: 'policy:head/walk', by: 'target', form: 'alphabet', measure: 'digest', needs: at, role: 'writes', scope: 'walk/context', value: pinned.pin })], account);
};
