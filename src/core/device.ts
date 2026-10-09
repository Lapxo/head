import { canonical, matches, parse } from '@lapxo/topos/wire';
import { members, said, valueOf } from './lock.ts';
import type { Said } from './lock.ts';
import { sayIn } from './surface.ts';

export interface Device { readonly account: string; readonly service: string; readonly signer: string }
const HEAD = 'head';

export const deviceOf = (lock: readonly Said[], role: string = HEAD): Device =>
  ({ account: valueOf(lock, `device/${role}/account`), service: valueOf(lock, 'device/service'), signer: valueOf(lock, `device/${role}/signer`) });

/**
 * The drafted lines a place signs to admit a key: each device/<role>/<measure> line of head-s lock, said of keys/<id>, and
 * its public half. The id is the role's own unless whoever admits names it; so is the coverage, unless they give it.
 */
export const admissionOf = (lock: readonly Said[], publicKey: string, role: string = HEAD, as: { readonly id?: string; readonly coverage?: string; readonly at?: string } = {}): readonly string[] => ((id, at) => [
  ...['class', 'coverage', 'resolution', 'signer'].flatMap((measure) => ((line) => (line === undefined ? [] : [canonical({ at, by: 'target', form: line.form ?? 'alphabet', measure, role: 'writes', scope: `keys/${id}`, value: measure === 'coverage' && as.coverage ? as.coverage : line.value ?? '' })]))(said(lock, `device/${role}/${measure}`))),
  canonical({ at, by: 'target', form: 'alphabet', measure: 'public-key', role: 'writes', scope: `keys/${id}`, value: publicKey }),
])(as.id ?? valueOf(lock, `device/${role}/account`), as.at ?? 'policy:head/device');

export const algorithmOf = (lines: readonly Said[]): string => ((era) => (lines.find((l) => l.scope === 'wire/signature-algorithms')?.value ?? '').split('|').find((one) => one.endsWith(`:${era}`)) ?? '')(valueOf(lines, 'wire/era'));

/** The id a place admits a public key under, as its own lines say: a key is who the place says it is, and a key it never admitted is no one there. */
export const idIn = (lines: readonly Said[], publicKey: string | undefined): string | undefined =>
  publicKey === undefined ? undefined : lines.find((l) => l.scope?.startsWith('keys/') && l.measure === 'public-key' && l.value === publicKey)?.scope!.slice('keys/'.length);

export const coverageOf = (lines: readonly Said[], id: string | undefined): readonly string[] =>
  id === undefined ? [] : lines.filter((l) => l.scope === `keys/${id}` && l.measure === 'coverage').flatMap((l) => members(l.value ?? ''));
export const covers = (lines: readonly Said[], id: string | undefined, scope: string): boolean => coverageOf(lines, id).some((glob) => matches(glob, scope));

/**
 * What head says instead of asking, when this device's key may not sign every line it would ask for in a place: what the
 * place admits it for and the first scope outside that, then the lines whoever configures the place can sign themselves.
 */
export const uncoveredIn = (lock: readonly Said[], lines: readonly Said[], publicKey: string | undefined, place: string, lot: readonly string[], scopes: readonly string[] = []): readonly string[] | undefined => {
  const id = idIn(lines, publicKey);
  const outside = [...scopes, ...lot.map((line) => ((got) => (got.kind === 'fact' ? got.value.fields['scope'] ?? '' : ''))(parse(line)))].find((scope) => !covers(lines, id, scope));
  return outside === undefined ? undefined : [sayIn(lock)('not-covered', { place, coverage: coverageOf(lines, id).join('|') || 'nothing', scope: outside }), ...lot];
};
