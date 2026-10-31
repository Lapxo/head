import { constants, closeSync, fstatSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { canonicalPath, layAt } from './place.ts';

/** Export paths are capabilities supplied by the receiver, never inferred from package contents. */
const destination = (roots: readonly string[], to: string) => {
  const at = resolve(to), root = roots.map(resolveRoot => resolve(resolveRoot)).filter(base => at.startsWith(base + sep)).sort((a,b) => b.length - a.length)[0];
  if (!root) throw Error('bundle/destination');
  const base = canonicalPath(root), rel = relative(root, at); let parent = base;
  for (const part of rel.split(sep).slice(0,-1)) {
    parent = join(parent, part);
    try { if (lstatSync(parent).isSymbolicLink() || !lstatSync(parent).isDirectory()) throw Error('bundle/destination'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; mkdirSync(parent); }
  }
  try { lstatSync(join(parent, basename(at))); throw Error('bundle/destination-exists'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const held = statSync(parent);
  return { at: join(parent, basename(at)), parent, check: () => { const now = statSync(parent); if (now.dev !== held.dev || now.ino !== held.ino || canonicalPath(parent) !== parent) throw Error('bundle/destination-changed'); } };
};
/** Publish a complete file exclusively; no overwrite and no following a destination symlink. */
export const publishFile = (roots: readonly string[], to: string, bytes: Uint8Array) => {
  const dest = destination(roots, to), temporary = mkdtempSync(join(dest.parent, '.head-export-')); let own: ReturnType<typeof statSync> | undefined;
  try { const stage = join(temporary, 'content'); writeFileSync(stage, bytes, { flag: 'wx', mode: 0o600 }); dest.check(); linkSync(stage, dest.at); own = statSync(stage); dest.check(); }
  catch (error) { if (own) { const current = lstatSync(dest.at); if (current.dev === own.dev && current.ino === own.ino) rmSync(dest.at); } throw error; }
  finally { rmSync(temporary, { recursive: true, force: true }); }
};
/** Write a new folder with its public lock last. Only a folder created by this call can be removed on failure. */
export const publishFolder = (roots: readonly string[], to: string, files: ReadonlyMap<string, Uint8Array>, lock: string) => {
  const dest = destination(roots, to); dest.check(); mkdirSync(dest.at, { mode: 0o700 });
  const fd = openSync(dest.at, constants.O_RDONLY | constants.O_NOFOLLOW), own = fstatSync(fd);
  try { for (const [path, bytes] of [...files].sort(([a],[b]) => a === lock ? 1 : b === lock ? -1 : a.localeCompare(b))) { dest.check(); const now = lstatSync(dest.at); if (now.ino !== own.ino || now.dev !== own.dev) throw Error('bundle/destination-changed'); layAt(dest.at, path, bytes); } dest.check(); }
  catch (error) { const now = lstatSync(dest.at); if (now.ino === own.ino && now.dev === own.dev && !now.isSymbolicLink()) rmSync(dest.at, { recursive: true, force: true }); throw error; }
  finally { closeSync(fd); }
};
