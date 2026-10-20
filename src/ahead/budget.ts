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
