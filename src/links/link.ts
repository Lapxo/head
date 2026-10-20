import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { encodeReference } from '@lapxo/bound/reference';
import { semanticStandingBytes } from '@lapxo/topos/standing';
import type { Context } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';

const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * A package's link: its lines as one standing document, laid in its folder as it is to be published — the link names that
 * document's bytes, never the package's files — and the #bound: link to it at the address the person publishes it at.
 * With no address there is no link, said so: a link needs where its bytes are published, and the digest still goes apart.
 */
export const linkOf = (context: Context, to: string, lines: readonly string[], urls: Readonly<Record<string, string>>): readonly string[] => {
  const say = sayIn(context.lock), [name, profile, [kind, algorithm]] = [valueOf(context.lock, 'link/document'), valueOf(context.lock, 'link/profile'), members(valueOf(context.lock, 'link/reference'))];
  const standing = semanticStandingBytes(lines), bytes = new TextEncoder().encode(JSON.stringify({ profile, standing })), at = urls[name], document = join(to, name);
  context.files.lay(to, name, bytes);
  if (at === undefined || !URL.canParse(at)) return [say('shared-unlinked', { document })];
  try { return [say('shared-link', { document, at, link: encodeReference({ class: kind, algorithm, digest: sha(standing), blob: `${algorithm}:${sha(bytes)}`, source: new URL(at).href } as Parameters<typeof encodeReference>[0]) })]; }
  catch (refused) { return [say('link-refused', { link: at, why: refused instanceof Error ? refused.message : String(refused) })]; }
};
