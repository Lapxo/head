import { basename, join } from 'node:path';
import { canonical, LOCK } from '@lapxo/topos/wire';
import { unless, type Asked, type Context } from '../core/answer.ts';
import { untilOf } from '../core/act.ts';
import { valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { rootIn } from '../flows/device.ts';
import { bornAt } from '../places/found.ts';
import { attachedFor } from '../sources/access.ts';

/**
 * The first source a person connects with no place named and none to read from, on one yes that says all it grants:
 * their place founded in the folder the lock names under their own home, the source connected to it, and reads of it
 * granted until the access period ends. A document that does not arrive is no refusal: the place is founded owing it
 * by its address. Either way the question asked comes back as what to ask next. A folder that already holds a place is
 * used as it stands, never founded again, and its connect asks its own yes.
 */
export const firstRun = async (asked: Asked, context: Context, then: (place: string, covered: boolean) => Promise<readonly string[]>): Promise<readonly string[]> => {
  const say = sayIn(context.lock), word = (k: string) => valueOf(context.lock, k), dir = join(context.personal(), word('first-run/folder')), name = basename(dir);
  if (context.files.has(dir, LOCK)) return then(dir, false);
  const [source, document, until] = [(asked['source'] ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-'), asked['document'] ?? '', untilOf(word('access/period'), context.now())];
  const refused = await unless(context, say('elicit-first-run', { dir, source, document, until }));
  if (refused) return refused;
  const born = await bornAt(context, dir, name), root = rootIn(context, dir);
  if (born[0] !== say('born', { name, dir }) || 'said' in root) return 'said' in root ? [...born, ...root.said] : born;
  const connected = await then(dir, true), unread = connected.some((l) => l.startsWith('said/head/document-unread ')), held = unread ? undefined : await context.policy(dir);
  if (held !== undefined && ('refused' in held || !held.lines.some((l) => l.scope === `uses/${source}`))) return [...born, ...connected];
  const line = (scope: string, measure: string, value: string, role = 'writes') => canonical({ at: 'policy:person/grant', by: 'target', form: 'alphabet', measure, role, scope, value });
  const owed = unread ? [line(`${word('place/needs')}/bytes/${source}`, 'id', document, 'demands')] : [];
  const landed = await context.landRoot(dir, [line(word('grant/family'), 'sources', source), line(word('grant/family'), 'until', until), ...owed], root.account);
  if ('refused' in landed) return [...born, ...connected, say('not-landed', { why: landed.refused })];
  const access = unread ? undefined : await attachedFor(context, dir, source);
  return [...born, ...(unread ? [] : connected), ...landed.lines, ...(access !== undefined && 'said' in access ? access.said : []), say(unread ? 'bytes-owed' : 'ready', { source, place: dir, document, operation: asked['operation'], args: asked['args'] })];
};
