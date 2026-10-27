import { join } from 'node:path';
import { encodeLocatedReference } from '@lapxo/topos/contract';
import { semanticStandingBytes } from '@lapxo/topos/standing';
import type { Context } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { digestIn } from '../core/worlds.ts';

/**
 * A package's link: its lines as one standing document, laid in its folder as it is to be published — the link names that
 * document's bytes, never the package's files. The separate located profile keeps retrieval apart from content identity.
 * Without a location the reference still names its content; it does not invent a holder or transfer authority.
 */
export const linkOf = (context: Context, to: string, lines: readonly string[], urls: Readonly<Record<string, string>>): readonly string[] => {
  const say = sayIn(context.lock), digest = digestIn(context.lock), [name, profile, [kind, algorithm]] = [valueOf(context.lock, 'link/document'), valueOf(context.lock, 'link/profile'), members(valueOf(context.lock, 'link/reference'))];
  const standing = semanticStandingBytes(lines), bytes = new TextEncoder().encode(JSON.stringify({ profile, standing })), at = urls[name], document = join(to, name);
  context.files.lay(to, name, bytes);
  try { return [say(at === undefined ? 'shared-unlinked' : 'shared-link', { document, at: at ?? '', link: encodeLocatedReference({ class: kind, algorithm, digest: digest(standing).slice(7), blob: digest(bytes), ...(at === undefined ? {} : { location: new URL(at).href, 'location-class': 'holder' }) } as Parameters<typeof encodeLocatedReference>[0]) })]; }
  catch (refused) { return [say('link-refused', { link: name, why: refused instanceof Error ? refused.message : String(refused) })]; }
};
