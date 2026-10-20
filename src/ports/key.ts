import { createHash, type Hash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const files = (at: string, apart: readonly string[] = []): readonly string[] => (!existsSync(at) || apart.includes(at) ? [] : statSync(at).isDirectory() ? readdirSync(at).sort().flatMap((name) => files(join(at, name), apart)) : [at]);
/** One file into a hash, its name and its bytes each preceded by its length, so no two sets of files hash alike. */
const framed = (hash: Hash, name: string, bytes: Uint8Array): Hash => hash.update(`${Buffer.byteLength(name)}:${name}${bytes.length}:`).update(bytes);
const found = (from: string, name: string): string | undefined => (existsSync(join(from, 'node_modules', name, 'package.json')) ? join(from, 'node_modules', name) : dirname(from) === from ? undefined : found(dirname(from), name));
const closure = (dir: string, seen: Set<string> = new Set()): Set<string> => (seen.has(dir) ? seen : (seen.add(dir), Object.keys(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies ?? {}).forEach((name) => ((at) => at && closure(at, seen))(found(dir, name))), seen));
const implementation = ((installed?: string) => (): string => (installed ??= [...closure(dirname(createRequire(import.meta.url).resolve('@lapxo/bound/package.json')))].sort().reduce((h, dir) => files(dir, [join(dir, 'node_modules')]).reduce((g, f) => framed(g, f, readFileSync(f)), h), createHash('sha256')).digest('hex')))();
export const gate = { apart: [] as readonly string[], environment: '' };
/** Whether a place reads as it did when its fold was kept, as head sees it: bound as installed, the day, the environment and
 * every file but what bound writes as it reads. It only decides whether bound is asked; never an identity, never sent out. */
export const keyOf = (place: string): string => files(place, gate.apart.map((a) => join(place, a))).reduce((h, f) => framed(h, f.slice(place.length), readFileSync(f)), framed(createHash('sha256'), implementation(), Buffer.from(JSON.stringify([new Date().toISOString().slice(0, 10), Object.entries(process.env).filter(([k]) => gate.environment !== '' && k.startsWith(gate.environment)).sort()])))).digest('hex');
