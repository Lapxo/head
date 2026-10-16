import { basename, join } from 'node:path';
import { LOCK } from '@lapxo/topos/wire';
import { unless, type Asked, type Context } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { bornAt } from '../places/found.ts';

/**
 * The first source a person connects with no place named and none to read from: their place is founded in the folder
 * the lock names under their own home, and the source connected to it, on one yes for both. A folder that already holds
 * a place is used as it stands, never founded again, and its connect asks its own yes.
 */
export const firstRun = async (asked: Asked, context: Context, then: (place: string, covered: boolean) => Promise<readonly string[]>): Promise<readonly string[]> => {
  const say = sayIn(context.lock), dir = join(context.personal(), valueOf(context.lock, 'first-run/folder')), name = basename(dir);
  if (context.files.has(dir, LOCK)) return then(dir, false);
  const refused = await unless(context, say('elicit-first-run', { dir, source: asked['source'] ?? '', document: asked['document'] ?? '' }));
  if (refused) return refused;
  const born = await bornAt(context, dir, name);
  return born[0] === say('born', { name, dir }) ? [...born, ...(await then(dir, true))] : born;
};
