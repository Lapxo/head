import { createHash } from 'node:crypto';
import { canonical } from '@lapxo/topos/wire';
import { members, valueOf, type Said } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { shapeOf } from '../ports/surface.ts';
import { windowOf } from '../ahead/budget.ts';
import type { headOf } from './head.ts';

type Asked = (verb: string, args: Record<string, unknown>) => Promise<readonly string[] | undefined>;

export const digestOf = (verb: string, args: unknown): string => createHash('sha256').update(JSON.stringify([verb, args])).digest('hex').slice(0, 16);
/** Whatever head refuses through a door is written in the place's evidence by head's key, by the request's digest (digestOf) and never its body, once a request a window, its count when the door closes, and no more than the door's own line allows in that window, at the instant head's clock hands in. */
export const refusalsOf = (lock: readonly Said[], head: { readonly write: (place: string, lot: readonly string[]) => Promise<unknown>; readonly now: () => number }, door: string) => {
  const word = (k: string) => valueOf(lock, k), [family, at, ceiling] = [word('doors/refused/family'), word('doors/refused/at'), lock.find((l) => l.scope === `${word('refusals/family')}/${door}`)], most = Number(ceiling?.value?.split('..')[1] ?? 0);
  const seen = new Map<string, { readonly place: string; readonly line: Record<string, string>; count: number }>(), windows = new Map<string, number>();
  const write = async (place: string | undefined, verb: string, digest: string, code: string): Promise<void> => {
    const instant = head.now(), since = windowOf(ceiling?.measure ?? '', instant), now = new Date(instant).toISOString(), known = seen.get(`${digest}\0${since}`), window = `${place}\0${since}`, n = (windows.get(window) ?? 0) + 1;
    if (known !== undefined) { known.count += 1; return; }
    if (place === undefined || since === undefined || n > most + 1) return;
    windows.set(window, n);
    const line = { at: `${at}:${now}`, by: 'target', form: 'alphabet', measure: 'count', role: 'writes', value: '1', ...(n > most ? { about: `ceiling of ${most} reached at ${now.slice(11, 16)}`, scope: `${family}/ceiling/${new Date(since).toISOString().replace(/\D/g, '')}` } : { about: `${verb} ${code}`, scope: `${family}/${digest}` }) };
    if (n <= most) seen.set(`${digest}\0${since}`, { place, line, count: 1 });
    await head.write(place, [canonical(line)]);
  };
  const settle = async (): Promise<void> => { for (const [key, { place, line, count }] of seen) if (count > 1) { seen.delete(key); await head.write(place, [canonical({ ...((({ about: _about, ...bare }) => bare)(line)), value: 'withdraw' }), canonical({ ...line, at: `${at}:${new Date(head.now()).toISOString()}`, value: String(count) })]); } };
  return { write, settle };
};
/** What a door that shows no form asks first: a call carries its place's card, but the ask for that card, which only reads it, and the connect that founds head's first place; what head refuses is written by head's own refusals, and a refusal head wrote already is not written again. */
export const guardOf = (lock: readonly Said[], head: ReturnType<typeof headOf>, asked: Asked) => {
  const [say, word, { write, settle }] = [sayIn(lock), (k: string) => valueOf(lock, k), head.refusals], [no, written] = [word('said/door-uncarded/state'), shapeOf([say('signing-key-refused', {})]).cells[0]!.code];
  const call = async (verb: string, args: Readonly<Record<string, unknown>> | undefined): Promise<readonly string[] | undefined> => {
    const a: Record<string, unknown> = { ...args }, place = typeof a['place'] === 'string' ? a['place'] : undefined, digest = digestOf(verb, a);
    const refuse = async (cell: string, into = place): Promise<readonly string[]> => (await write(into ?? await head.placed(), verb, digest, shapeOf([cell]).cells[0]!.code), [cell]);
    if (verb === word('doors/first') && place === undefined) {
      if (await head.hasPlace()) return refuse(say('door-founded', {}));
      const [lines, founded] = [await asked(verb, a), await head.placed()], card = founded === undefined ? undefined : await head.cardOf(founded);
      return [...(lines ?? []), ...(card !== undefined && 'card' in card ? [say('card', { place: founded!, card: card.card, from: verb })] : [])];
    }
    if (verb === word('doors/card') && String(a['card']) === 'true') return asked(verb, a);
    if (typeof a['card'] !== 'string' || place === undefined) return refuse(say('door-uncarded', { place: place ?? '' }));
    if (!members(word('doors/checks')).includes(verb)) { const now = await head.cardOf(place); if (!('card' in now) || now.card !== a['card']) return refuse(say('card-stale', { action: verb, place, card: a['card'] })); delete a['card']; }
    if (verb === word('doors/carrier') && a['action'] === word('doors/claim') && a['origin'] !== word('claim/agent')) return refuse(say('door-unoriginated', { place }));
    const lines = await asked(verb, a), refused = lines === undefined ? undefined : shapeOf(lines).cells.find((c) => c.state === no && c.code !== written);
    if (refused !== undefined) await write(place, verb, digest, refused.code);
    return lines;
  };
  return { call: async (...args: Parameters<typeof call>) => { try { return await call(...args); } catch (error) { if (error instanceof Error && /^home\/(identity|namespace|approval)$/.test(error.message)) return [say('home-refused', { why: error.message })]; throw error; } }, settle };
};
