import { existsSync, lstatSync, realpathSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCK } from '@lapxo/topos/wire';
import { declaredOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';

/** The lines head's own lock declares, decoded; a missing lock is an error, never an empty lock. */
export const lockAt = (dir: string): readonly Said[] => declaredOf(readFileSync(join(dir, LOCK), 'utf8'));

/** A root the client shares, as the folder it names; a root that names no file folder is no place. */
export const folderOf = (uri: string): string | undefined => { try { return fileURLToPath(uri); } catch { return undefined; } };

/** Resolve existing ancestors without trusting a lexical child path. Missing suffixes retain their names. */
export const canonicalPath = (path: string): string => {
  const at = resolve(path); try { return realpathSync(at); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(at) === at) throw error;
    return join(canonicalPath(dirname(at)), basename(at));
  }
};
const inside = (place: string, rel: string): string => {
  const base = resolve(place), at = resolve(place, rel);
  if (!at.startsWith(base + sep)) throw Error('REFUSE·place a path outside its place');
  let child = base;
  for (const part of at.slice(base.length + 1).split(sep)) { child = join(child, part); try { if (lstatSync(child).isSymbolicLink()) throw Error('REFUSE·place a symbolic-link child'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
  return at;
};
/** Bytes laid at a path inside a place, its folders made; a path outside the place is refused. */
export const layAt = (place: string, rel: string, bytes: Uint8Array): void => { const at = inside(place, rel); mkdirSync(dirname(at), { recursive: true }); writeFileSync(at, bytes); };
export const takeAt = (path: string): Uint8Array | undefined => { try { return readFileSync(path); } catch { return undefined; } };
export const hasAt = (place: string, rel: string): boolean => existsSync(resolve(place, rel));
export const dropAt = (place: string, rel: string): void => rmSync(inside(place, rel), { force: true });
export const listAt = (place: string, rel: string): readonly string[] => { try { return readdirSync(inside(place, rel)); } catch { return []; } };
