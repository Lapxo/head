import { isAbsolute, basename } from 'node:path';
import { canonical, LOCK } from '@lapxo/topos/wire';
import { unless } from '../core/answer.ts';
import type { Asked, Context } from '../core/answer.ts';
import { admissionOf } from '../core/device.ts';
import { members, valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import { deviceKey, homeIndex } from '../flows/device.ts';
import { walkable } from '../walk/context.ts';
import { fill, sayIn } from '../core/surface.ts';

/** Found the place from the declared prelude; personal lines retain the person's provenance. */
const birthOf = (lock: readonly Said[], root: string, head: string, person: string, place: string, mine = `${valueOf(lock, 'founding/person-at')}birth`): readonly string[] => [
  ...[['class', 'authorize'], ['coverage', '*'], ['signer', valueOf(lock, 'device/head/signer')], ['public-key', root]].map(([measure, value]) =>
    canonical({ at: mine, by: 'target', form: 'alphabet', measure: measure!, role: 'writes', scope: valueOf(lock, 'founding/root'), value: value! })),
  ...admissionOf(lock, head, 'head'), ...admissionOf(lock, person, 'person'),
  ...lock.filter((l) => l.scope?.startsWith('birth/')).map(({ about: _about, scope, ...line }) => ((s) => canonical({ ...line, value: fill(line.value ?? '', { place }), scope: s, at: members(valueOf(lock, 'founding/person')).includes(s) ? mine : 'policy:head/birth', by: 'target' } as Record<string, string>))(scope!.slice('birth/'.length))),
];

/** A place founded in a folder: a root key made in the keychain under the place's name — never a file — the birth lines written, and the first land signed by that root. */
const founded = async (context: Context, dir: string, name: string): Promise<{ readonly lines: readonly string[] } | { readonly refused: string; readonly why?: string }> => {
  if (context.files.has(dir, LOCK) || context.files.has(dir, '.bound')) return { refused: 'place-exists' };
  const account = fill(valueOf(context.lock, 'founding/root-account'), { place: name });
  const [head, person] = [await deviceKey(context, 'head'), await deviceKey(context, 'person')];
  if (head === undefined || person === undefined) return { refused: 'no-keychain' };
  if (await context.keys.held?.(account) !== undefined) return { refused: 'place-taken' };
  const root = await context.keys.made?.(account);
  if (root === undefined) return { refused: 'no-keychain' };
  context.files.lay(dir, LOCK, new TextEncoder().encode(`${birthOf(context.lock, root, head, person, name).join('\n')}\n`));
  const born = await context.found(dir, account);
  return ((got) => ('refused' in got ? { refused: 'not-landed', why: got.refused } : got))('refused' in born ? born : await walkable(context, dir, account));
};

/**
 * A place born where the person names, once they said yes: founded with its own root and the prelude head declares,
 * and named in head's own index of places — itself a place, founded the first time — by a line its root signs.
 */
export const bornPlace = async (asked: Asked, context: Context): Promise<readonly string[]> => {
  const say = sayIn(context.lock);
  const dir = asked['dir'] ?? '';
  if (!isAbsolute(dir)) return [say('place-absolute')];
  const name = (asked['name'] || basename(dir)).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  if (context.files.has(dir, LOCK) || context.files.has(dir, '.bound')) return [say('place-exists', { dir })];
  const index = await homeIndex(context); if ('refused' in index) return [say(index.refused === 'index/invalid' ? 'index-invalid' : 'index-unread', { place: context.home() })];
  const refused = await unless(context, say('elicit-place', { name, dir }));
  return refused ?? bornAt(context, dir, name);
};

export const bornAt = async (context: Context, dir: string, name: string): Promise<readonly string[]> => {
  const index = await homeIndex(context), say = sayIn(context.lock); if ('refused' in index) return [say(index.refused === 'index/invalid' ? 'index-invalid' : 'index-unread', { place: context.home() })];
  const born = await founded(context, dir, name);
  if ('refused' in born) return [say(born.refused, { name, dir, why: born.why ?? '' })];
  const home = context.home();
  const homed = context.files.has(home, LOCK) ? { lines: [] } : await founded(context, home, valueOf(context.lock, 'home/name'));
  if ('refused' in homed) return [say(homed.refused, { name: valueOf(context.lock, 'home/name'), dir: home, why: homed.why ?? '' })];
  const line = canonical({ at: 'policy:head/places', by: 'target', form: 'alphabet', measure: 'id', role: 'writes', scope: `${valueOf(context.lock, 'home/family')}/${name}`, value: dir });
  const indexed = await context.landRoot(home, [line], fill(valueOf(context.lock, 'founding/root-account'), { place: valueOf(context.lock, 'home/name') }));
  return 'refused' in indexed ? [say('not-landed', { why: indexed.refused })] : [say('born', { name, dir }), ...indexed.lines];
};
