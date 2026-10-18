import { basename, dirname, join } from 'node:path';
import { EXTENSION } from '@lapxo/topos/wire';
import type { Asked, Context } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';

/**
 * What a person names as a source's document, made a document head can read, before anything is founded or connected:
 * an address or a file is as given; a site alone is looked for where it says its documents are (its API catalog) and at
 * the paths the lock names, the first that reads taken; a folder, at the same names inside it. A source the person names
 * none for is named after the site or the folder. A site where nothing reads is said, with what was tried.
 */
export const resolved = async (asked: Asked, context: Context): Promise<{ readonly asked: Asked } | { readonly said: readonly string[] }> => {
  const [at, word] = [asked['document'] ?? '', (k: string) => valueOf(context.lock, k)], named = (name: string) => asked['source'] || name.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  if (/^([a-z]+:\/\/)?[^/\s]+\.[^/\s]+\/?$/.test(at) && URL.canParse(/^[a-z]+:\/\//.test(at) ? at : `${word('use/scheme')}//${at}`)) {
    const site = new URL(/^[a-z]+:\/\//.test(at) ? at : `${word('use/scheme')}//${at}`), tried = await context.files.read.describedAt(context, site.origin);
    for (const document of tried) if (((read) => read !== undefined && `.${read.kind}` !== EXTENSION)(await context.files.read.documentOf(context, '', document))) return { asked: { ...asked, document, source: named(site.hostname) } };
    return { said: [sayIn(context.lock)('use-none', { origin: site.origin, tried: tried.join(', ') || '—' })] };
  }
  const inside = at.startsWith('/') && context.files.list(dirname(at), basename(at)).length ? members(word('use/documents')).map((p) => basename(p)).find((n) => context.files.has(at, n)) : undefined;
  return { asked: inside === undefined ? asked : { ...asked, document: join(at, inside), source: named(basename(at)) } };
};
