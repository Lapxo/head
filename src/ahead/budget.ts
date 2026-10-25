import { canonical } from '@lapxo/topos/wire';
import type { Asked } from '../core/answer.ts';
import type { Said } from '../core/lock.ts';
import { spentOf } from '../core/receipt.ts';

const early = (asked: Asked): boolean => asked['ahead'] === 'true';

/** Whether a read would spend past what the place allows: a question, past the place's rate; a read ahead, past the share of what the questions leave of it that reads ahead may spend. A read ahead is told by the mark beside its receipt, and counted once. */
export const overOf = (lines: readonly Said[], [family, at, mark]: readonly [string, string, string], source: string, now: number, rate: number, share: number, asked: Asked): boolean => {
  const ahead = lines.filter((l) => l.scope?.startsWith(`${family}/${source}/`) && l.scope.endsWith(`/${mark}`) && l.at?.startsWith(`${at}:`) && now - Date.parse(l.at.slice(at.length + 1)) < 3_600_000).length;
  const calls = spentOf(lines, family, at, source, now) - ahead;
  return calls >= rate || (early(asked) && ahead + 1 > ((rate - (calls - ahead)) * share) / 100);
};

/** The mark a read made ahead lands beside its receipt, under the receipt's own at, so what reads ahead spent is counted apart from what questions spent. */
export const markOf = (asked: Asked, [at, mark]: readonly [string, string], scope: string, digest: string, when: string): readonly string[] =>
  early(asked) ? [canonical({ at: `${at}:${when}`, by: 'target', form: 'alphabet', measure: 'digest', role: 'writes', scope: `${scope}/${mark}`, value: digest })] : [];

/** When the window a ceiling's own measure names, `<unit>/R/<start>/P<n>D` or `…/PT<n>H` (ISO 8601), began around an instant handed in; undefined where the measure names no window. */
export const windowOf = (window: string, now: number): number | undefined => {
  const [, start, days, hours] = /^[^/]+\/R\/([^/]+)\/P(?:(\d+)D|T(\d+)H)$/.exec(window) ?? [], [from, period] = [Date.parse(start ?? ''), (Number(days ?? 0) * 24 + Number(hours ?? 0)) * 3_600_000];
  return Number.isNaN(from) || !period ? undefined : from + Math.floor((now - from) / period) * period;
};
/** The calls a ceiling's window holds at an instant: its receipts since that window began, a read ahead's mark apart; undefined where the measure names no window. */
export const calledIn = (lines: readonly Said[], [family, at, mark]: readonly [string, string, string], source: string, window: string, now: number): number | undefined => ((since) => (since === undefined ? undefined
  : lines.filter((l) => l.scope?.startsWith(`${family}/${source}/`) && !l.scope.endsWith(`/${mark}`) && l.at?.startsWith(`${at}:`) && Date.parse(l.at.slice(at.length + 1)) >= since).length))(windowOf(window, now));
