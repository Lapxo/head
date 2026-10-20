import { createHash, type Hash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const files = (at: string, apart: readonly string[] = []): readonly string[] => (!existsSync(at) || apart.includes(at) ? [] : statSync(at).isDirectory() ? readdirSync(at).sort().flatMap((name) => files(join(at, name), apart)) : [at]);
/** One file into a hash, its name and its bytes each preceded by its length, so no two sets of files hash alike. */
const framed = (hash: Hash, name: string, bytes: Uint8Array): Hash => hash.update(`${Buffer.byteLength(name)}:${name}${bytes.length}:`).update(bytes);
const found = (from: string, name: string): string | undefined => existsSync(join(from, 'node_modules', name, 'package.json')) ? join(from, 'node_modules', name) : dirname(from) === from ? undefined : found(dirname(from), name);
const closure = (dir: string, seen: Set<string> = new Set()): Set<string> => (seen.has(dir) ? seen : (seen.add(dir), Object.keys(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies ?? {}).forEach((name) => ((at) => at && closure(at, seen))(found(dir, name))), seen));
let installed: string | undefined;
/** bound as installed and every package it depends on, each whole, hashed once a process: what bound runs is part of what a reading reads, its own catalog and lock beside its code. */
const implementation = (): string => (installed ??= [...closure(dirname(createRequire(import.meta.url).resolve('@lapxo/bound/package.json')))].sort()
  .reduce((h, dir) => files(dir, [join(dir, 'node_modules')]).reduce((g, f) => framed(g, f, readFileSync(f)), h), createHash('sha256')).digest('hex'));

/**
 * What a reading of a place reads, as far as head sees it without bound: bound as installed, the day, the environment bound
 * is started in, and every file of the place but those the lock sets apart, which only exist while bound runs or are what
 * bound writes of its own folds. Anything of it that moves makes another reading. It decides only whether a place is folded
 * again: it is never an identity, and never goes into a receipt, a share, a why or anything else that leaves this process.
 * Head cannot see all a fold reads, so it stands, with its line, only until bound gives a view's identity cheaply.
 */
export const readingOf = (place: string, apart: readonly string[], environment: string): string =>
  files(place, apart.map((a) => join(place, a))).reduce((h, f) => framed(h, f.slice(place.length), readFileSync(f)), framed(createHash('sha256'), implementation(), Buffer.from(JSON.stringify([new Date().toISOString().slice(0, 10), Object.entries(process.env).filter(([k]) => k.startsWith(environment)).sort()])))).digest('hex');
