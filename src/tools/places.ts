import { LOCK } from '@lapxo/topos/wire';
import { standingOr } from '../core/answer.ts';
import type { Answer } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';

/**
 * What this device has connected, read off each place's lines as bound folds them and the receipts its own keys signed:
 * every place head's index names — or the one asked — the sources it pinned, the grants that stand today and the last
 * read it kept a receipt of. Nothing is asked, called or signed.
 */
export const answer: Answer = async (asked, context) => {
  const [say, word, home, today] = [sayIn(context.lock), (k: string) => valueOf(context.lock, k), context.home(), new Date(context.now()).toISOString().slice(0, 10)];
  const index = context.files.has(home, LOCK) ? await standingOr(context, home, context.policy) : { lines: [] };
  if ('said' in index) return index.said;
  const places = index.lines.filter((l) => l.scope?.startsWith(`${word('home/family')}/`) && (!asked['place'] || l.value === asked['place']));
  if (!places.length) return [say('places-none', { place: asked['place'] ?? '' })];
  const said: string[] = [];
  for (const p of places) {
    const held = await standingOr(context, p.value!);
    if ('said' in held) { said.push(...held.said); continue; }
    const at = word('receipt/at'), last = held.lines.filter((l) => l.scope?.startsWith(`${word('receipt/family')}/`) && l.at?.startsWith(`${at}:`)).sort((a, b) => (a.at! < b.at! ? 1 : -1))[0];
    said.push(say('place-held', { name: p.scope!.split('/')[1]!, dir: p.value!,
      sources: held.lines.filter((l) => l.scope?.startsWith('uses/') && l.needs?.startsWith(`${word('place/compiled')}/`)).map((l) => l.scope!.slice('uses/'.length)).join(', ') || '—',
      grants: held.lines.filter((l) => l.scope?.startsWith('allow/') && !(l.measure === 'until' && (l.value ?? '') < today)).map((l) => `${l.scope} ${l.measure} ${l.value}`).join('; ') || '—',
      last: last ? `${last.scope!.split('/').slice(1, 3).join('/')} at ${last.at!.slice(at.length + 1)}` : '—' }));
  }
  return said;
};
