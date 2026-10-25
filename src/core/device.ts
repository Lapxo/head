import { canonical, matches, parse } from '@lapxo/topos/wire';
import { members, said, valueOf } from './lock.ts';
import type { Said } from './lock.ts';
import { sayIn } from './surface.ts';

export interface Device { readonly account: string; readonly service: string; readonly signer: string }
const HEAD = 'head';

export const deviceOf = (lock: readonly Said[], role: string = HEAD): Device =>
  ({ account: valueOf(lock, `device/${role}/account`), service: valueOf(lock, 'device/service'), signer: valueOf(lock, `device/${role}/signer`) });
/** The line of the lock that names a keychain account's signing key, if it keeps one: a device's by its role, or a place's root by its template. */
export const signingOf = (lock: readonly Said[]) => ((devices, [pre = '', post = ''] = valueOf(lock, 'founding/root-account').split('{place}')) => (account: string): string | undefined => devices.find((l) => l.value === account)?.scope ?? (account.startsWith(pre) && account.endsWith(post) && !account.slice(pre.length, account.length - post.length).includes('/') ? 'founding/root-account' : undefined))(lock.filter((l) => /^device\/[^/]+\/account$/.test(l.scope ?? '')));

/** Derive device authority from the admitted lock. */
export const admissionOf = (lock: readonly Said[], publicKey: string, role: string = HEAD, as: { readonly id?: string; readonly coverage?: string; readonly at?: string } = {}): readonly string[] => ((id, at) => [
  ...['class', 'coverage', 'resolution', 'signer'].flatMap((measure) => ((line) => (line === undefined ? [] : [canonical({ at, by: 'target', form: line.form ?? 'alphabet', measure, role: 'writes', scope: `keys/${id}`, value: measure === 'coverage' && as.coverage ? as.coverage : line.value ?? '' })]))(said(lock, `device/${role}/${measure}`))),
  canonical({ at, by: 'target', form: 'alphabet', measure: 'public-key', role: 'writes', scope: `keys/${id}`, value: publicKey }),
])(as.id ?? valueOf(lock, `device/${role}/account`), as.at ?? 'policy:person/device');

/** The id a place admits a public key under, as its own lines say: a key is who the place says it is, and a key it never admitted is no one there. */
export const idIn = (lines: readonly Said[], publicKey: string | undefined): string | undefined =>
  publicKey === undefined ? undefined : lines.find((l) => l.scope?.startsWith('keys/') && l.measure === 'public-key' && l.value === publicKey)?.scope!.slice('keys/'.length);

export const coverageOf = (lines: readonly Said[], id: string | undefined): readonly string[] =>
  id === undefined ? [] : lines.filter((l) => l.scope === `keys/${id}` && l.measure === 'coverage').flatMap((l) => members(l.value ?? ''));

/**
 * What head says instead of asking, when this device's key may not sign every line it would ask for in a place: what the
 * place admits it for and the first scope outside that, then the lines whoever configures the place can sign themselves.
 */
export const uncoveredIn = (lock: readonly Said[], lines: readonly Said[], publicKey: string | undefined, place: string, lot: readonly string[], scopes: readonly string[] = []): readonly string[] | undefined => {
  const coverage = coverageOf(lines, idIn(lines, publicKey));
  const outside = [...scopes, ...lot.map((line) => ((got) => (got.kind === 'fact' ? got.value.fields['scope'] ?? '' : ''))(parse(line)))].find((scope) => !coverage.some((glob) => matches(glob, scope)));
  return outside === undefined ? undefined : [sayIn(lock)('not-covered', { place, coverage: coverage.join('|') || 'nothing', scope: outside }), ...lot];
};
