import { configuredProtocol } from '../ports/adapters/configured.ts';
import { join, dirname, basename } from 'node:path';
import type { Asked, Context } from './answer.ts';
import { canonical, parse } from '@lapxo/topos/wire';
import { compose, type Recipe, type Source } from './composition.ts';
import { sayIn } from './surface.ts';
import { digestIn, linesOf } from './worlds.ts';
import { foreignIn, sharePath } from './package.ts';
import { valueOf } from './lock.ts';

/** Refusals expose only declared public bundle codes, never host paths or parsed payloads. */
export const bundleRefusal = (context: Context, error: unknown) => [sayIn(context.lock)('bundle-refused', { why: error instanceof Error && /^bundle\/[a-z-]+$/.test(error.message) ? error.message : 'bundle/invalid' })];

/** Export only the existing public package. Connecting a document remains the consented connect action; it is never hidden in export. */
export async function shareBundle(asked: Asked, context: Context, read: () => Promise<{ readonly files: ReadonlyMap<string, Uint8Array>; readonly sources: readonly Source[] }>) {
  const to = asked['to'] ?? '', say = sayIn(context.lock), suffix = valueOf(context.lock, 'share/bundle-suffix');
  if (!suffix || !to.endsWith(suffix)) return undefined;
  if (!context.bundle || !await sharePath(context, asked['place'] ?? '', to) || context.files.has(dirname(to), basename(to))) return [say('bundle-refused', { why: 'bundle/unavailable-or-destination' })];
  try {
    const payload = asked['args'] ? JSON.parse(asked['args']) as Recipe : undefined;
    let material = payload ? await read() : undefined;
    if (material) {
      for (const choice of payload!.sources as readonly (Recipe['sources'][number] & { readonly document?: string; readonly protocol?: string })[]) if (!material.sources.some(source => source.name === choice.source)) {
        const url = choice.document && URL.canParse(choice.document) ? new URL(choice.document) : undefined;
        if (!url || url.protocol !== valueOf(context.lock, 'use/scheme') || url.href !== url.origin + url.pathname) throw Error('bundle/source-document');
        return [say(choice.protocol === configuredProtocol.id ? configuredProtocol.sourceNeeded : 'bundle-source-needed', { source: choice.source, document: url.href })];
      }
      const lock = material.files.get('TARGET.bound');
      if (!lock || new TextDecoder().decode(lock).split('\n').filter(Boolean).some(line => parse(line).kind !== 'fact') || foreignIn(linesOf(lock))) throw Error('bundle/public-lock');
      const declared = linesOf(lock);
      for (const source of material.sources) if (!declared.some(line => line.scope === `uses/${source.name}` && line.value === source.pin) || !declared.some(line => line.scope === `sources/${source.name}` && line.value === source.document)) throw Error('bundle/source-pin');
      const made = compose(payload!, material.sources, Number(valueOf(context.lock, 'share/bundle-selections').split('..')[1])), selected = new Set(made.entries.map(entry => entry.source));
      const lines = linesOf(lock).filter(line => !line.needs || selected.has(line.scope!.split('/')[1]!));
      if (lines.some(line => line.restsOn?.split('|').some(parent => !selected.has(parent.split('/')[1]!)))) throw Error('bundle/unselected-parent');
      const retained = new Map(lines.filter(line => line.needs).map(line => [line.needs!, material!.files.get(line.needs!)!]));
      retained.set('TARGET.bound', Buffer.from(lines.map(line => canonical(line)).join('\n') + '\n'));
      material = { sources: material.sources.filter(source => selected.has(source.name)), files: retained };
      for (const line of lines.filter(line => line.needs && line.measure === 'digest')) {
        const bytes = material.files.get(line.needs!);
        if (!bytes || digestIn(context.lock)(bytes) !== line.value) throw Error('bundle/public-digest');
      }
    }
    const got = await context.bundle(material && payload ? { recipe: payload, ...material } : undefined);
    context.files.lay(dirname(to), basename(to), got.bytes);
    return [say('bundle-shared', { document: to, digest: got.digest, sources: got.sources.join(', ') })];
  } catch (error) { return bundleRefusal(context, error); }
}
