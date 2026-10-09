import { createHash } from 'node:crypto';
import { parse } from '@lapxo/topos/wire';
import { members, valueOf } from './lock.ts';
import type { Said } from './lock.ts';

/** The facts bytes hold, in their order. */
export const linesOf = (bytes: Uint8Array): readonly Said[] => new TextDecoder().decode(bytes).split('\n').flatMap((line) => ((got) => (got.kind === 'fact' ? [got.value.fields] : []))(parse(line)));

/** Bytes named by their digest, under the algorithm the wire names: a pinned standing is exactly the bytes its pin hashes. */
export const digestIn = (lock: readonly Said[]) => (bytes: Uint8Array | string): string => ((algorithm) => `${algorithm}:${createHash(algorithm).update(bytes).digest('hex')}`)(valueOf(lock, 'wire/digest-algorithms'));

/** A compiled standing as a place holds it: its pin, the digest of its bytes, and its lines; none when the place holds no such file. */
export const pinnedOf = (lock: readonly Said[], bytes: Uint8Array | undefined): { readonly pin: string; readonly lines: readonly Said[] } | undefined =>
  (bytes === undefined ? undefined : { pin: digestIn(lock)(bytes), lines: linesOf(bytes) });
