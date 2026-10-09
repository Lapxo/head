import type { Said } from './lock.ts';

const hi = (lines: readonly Said[], scope: string): number | undefined => ((line) => (line === undefined ? undefined : Number((line.value ?? '').split('..')[1])))(lines.find((l) => l.scope === scope && l.measure === 'calls'));

/** How many times the person allows an operation: their line for it, never more than their line for the whole source; none, none. */
export const allowedOf = (lines: readonly Said[], family: string, api: string, operation: string): number =>
  Math.min(hi(lines, `${family}/${api}/${operation}`) ?? 0, hi(lines, `${family}/${api}`) ?? Infinity);

/** Whether the person granted head to read a source, by the one sentence they signed for the place: the sources it names, until the day it names. */
export const grantedOf = (lines: readonly Said[], family: string, source: string, now: number): boolean =>
  (lines.find((l) => l.scope === family && l.measure === 'sources')?.value ?? '').split('|').includes(source) && Date.parse(lines.find((l) => l.scope === family && l.measure === 'until')?.value ?? '') > now;

export const cappedOf = (lines: readonly Said[], family: string, source: string, operation: string): boolean => hi(lines, `${family}/${source}/${operation}`) !== undefined || hi(lines, `${family}/${source}`) !== undefined;

export const askedOf = (lines: readonly Said[], family: string, api: string, operation: string): boolean => lines.some((l) => l.scope === `${family}/${api}/${operation}` && l.value === 'present');

export const isOpen = (lines: readonly Said[], intent: string, ends: readonly string[]): boolean =>
  lines.filter((l) => l.scope === intent && l.value === 'present').length > lines.filter((l) => ends.some((end) => l.scope === `${intent}/${end}`)).length;

/**
 * The acts of an operation as its receipts say them: every end it got, a receipt or a look that closed an intent — a
 * call that may have happened counts against the allowance as one that did, even when the same request ran again —
 * and whether this request has an intent still open.
 */
export const actsOf = (lines: readonly Said[], family: string, ends: readonly string[], api: string, operation: string, request: string) => {
  const under = `${family}/${api}/${operation}/`;
  return { done: lines.filter((l) => l.scope?.startsWith(under) && ends.some((end) => l.scope!.endsWith(`/${end}`))).length, open: isOpen(lines, `${under}${request.slice(0, 16)}`, ends) };
};
