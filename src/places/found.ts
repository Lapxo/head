import { isAbsolute, basename } from 'node:path';
import { canonical, LOCK } from '@lapxo/topos/wire';
import { unless } from '../core/answer.ts';
import type { Asked, Context } from '../core/answer.ts';
import { admissionOf } from '../core/device.ts';
import { newKey } from '../core/keys.ts';
import { valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import { deviceKey } from '../flows/device.ts';
import { walkable } from '../walk/context.ts';
import { fill, sayIn } from '../core/surface.ts';

/**
 * The lines a place is born with, every one drafted by target: its root, by the public half of a key kept only in the
 * keychain and the signer that reaches it; this device's keys admitted; and the prelude head's lock declares under
 * birth/ — the wire, the regions and views a world is read through, and the lifetime every reader is bounded by.
 */
const birthOf = (lock: readonly Said[], root: string, head: string, person: string, place: string): readonly string[] => [
  ...[['class', 'authorize'], ['coverage', '*'], ['signer', valueOf(lock, 'device/head/signer')], ['public-key', root]].map(([measure, value]) =>
    canonical({ at: 'policy:head/birth', by: 'target', form: 'alphabet', measure: measure!, role: 'writes', scope: valueOf(lock, 'founding/root'), value: value! })),
  ...admissionOf(lock, head, 'head'), ...admissionOf(lock, person, 'person'),
  ...lock.filter((l) => l.scope?.startsWith('birth/')).map(({ about: _about, scope, ...line }) => canonical({ ...line, value: fill(line.value ?? '', { place }), scope: scope!.slice('birth/'.length), at: 'policy:head/birth', by: 'target' } as Record<string, string>)),
];

/** A place founded in a folder: a root key made in the keychain under the place's name — never a file — the birth lines written, and the first land signed by that root. */
const founded = async (context: Context, dir: string, name: string): Promise<{ readonly lines: readonly string[] } | { readonly refused: string; readonly why?: string }> => {
  const account = fill(valueOf(context.lock, 'founding/root-account'), { place: name });
  const [head, person] = [deviceKey(context, 'head'), deviceKey(context, 'person')];
  if (head === undefined || person === undefined) return { refused: 'no-keychain' };
  if (context.keys.read(account) !== undefined) return { refused: 'place-taken' };
  const root = newKey();
  context.keys.write(account, root.secret);
  context.files.lay(dir, LOCK, new TextEncoder().encode(`${birthOf(context.lock, root.publicKey, head, person, name).join('\n')}\n`));
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
  if (context.files.has(dir, LOCK)) return [say('place-exists', { dir })];
  const refused = await unless(context, say('elicit-place', { name, dir }));
  if (refused) return refused;
  const born = await founded(context, dir, name);
  if ('refused' in born) return [say(born.refused, { name, dir, why: born.why ?? '' })];
  const home = context.home();
  const homed = context.files.has(home, LOCK) ? { lines: [] } : await founded(context, home, valueOf(context.lock, 'home/name'));
  if ('refused' in homed) return [say(homed.refused, { name: valueOf(context.lock, 'home/name'), dir: home, why: homed.why ?? '' })];
  const line = canonical({ at: 'policy:head/places', by: 'target', form: 'alphabet', measure: 'id', role: 'writes', scope: `${valueOf(context.lock, 'home/family')}/${name}`, value: dir });
  const indexed = await context.landRoot(home, [line], fill(valueOf(context.lock, 'founding/root-account'), { place: valueOf(context.lock, 'home/name') }));
  return 'refused' in indexed ? [say('not-landed', { why: indexed.refused })] : [say('born', { name, dir }), ...indexed.lines];
};
