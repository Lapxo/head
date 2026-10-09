import { createHash } from 'node:crypto';
import { canonical } from '@lapxo/topos/wire';
import type { Said } from './lock.ts';

/** The scope a read is kept under: the source, the operation, and the first steps of the digest of the request and whom it was made as, so only the same request made as the same principal finds it again. The drafted receipt of one read names what was asked, the digest of what came back, and when; the device key signs it. */
export const scopeOf = (family: string, api: string, operation: string, request: string, principal: string): string =>
  `${family}/${api}/${operation}/${createHash('sha256').update(`${request}\n${principal}`).digest('hex').slice(0, 16)}`;

export const draftOf = (family: string, at: string, scope: string, digest: string, when: string): string =>
  canonical({ at: `${at}:${when}`, by: 'target', form: 'alphabet', measure: 'digest', role: 'writes', scope, value: digest });

/** What a typed answer stands on besides its body: the worlds the place uses and the code that interprets them, and what the source compiles to; what is kept under it holds only while these stand. */
export const basisOf = (lines: readonly Said[], word: (scope: string) => string, source: string): string => createHash('sha256').update(lines.filter((l) => l.scope?.startsWith('uses/') || l.scope?.startsWith('dep/')
  || l.scope === `${word('vocab/region')}/${source}` || [word('vocab/offers'), word('vocab/keys')].some((family) => l.scope?.startsWith(`${family}/${source}/`))).map((l) => canonical(l)).sort().join('\n')).digest('hex').slice(0, 16);

/** Head's own receipts under a scope, or under any scope below it, newest first: each once, by when it was made and what it names; a duplicate delivery is the same receipt. */
export const receiptsOf = (lines: readonly Said[], at: string, scope: string, below = false): readonly { readonly scope: string; readonly at: string; readonly digest: string }[] =>
  [...new Map(lines.filter((l) => (l.scope === scope || (below && l.scope?.startsWith(`${scope}/`))) && l.measure === 'digest' && l.at?.startsWith(`${at}:`) && l.value?.startsWith('sha256:'))
    .map((l) => [`${l.at} ${l.value}`, { scope: l.scope!, at: l.at!.slice(at.length + 1), digest: l.value! }])).values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

export const spentOf = (lines: readonly Said[], family: string, at: string, api: string, now: number): number => lines.filter((l) =>
  l.scope?.startsWith(`${family}/${api}/`) && l.at?.startsWith(`${at}:`) && now - Date.parse(l.at.slice(at.length + 1)) < 3_600_000).length;
