import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folder = (): string => { const at = join(tmpdir(), 'head-reads'); mkdirSync(at, { recursive: true, mode: 0o700 }); return at; };
export const digestOf = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** A read-s body kept by its digest, readable only by its owner; what is read back must hash to the name it is kept under. */
export const keep = (bytes: Uint8Array): string => ((digest) => { writeFileSync(join(folder(), digest.slice(7)), bytes, { mode: 0o600 }); return digest; })(digestOf(bytes));
export const held = (digest: string): Uint8Array | undefined => { try { return ((bytes) => (digestOf(bytes) === digest ? bytes : undefined))(readFileSync(join(folder(), digest.slice(7)))); } catch { return undefined; } };
