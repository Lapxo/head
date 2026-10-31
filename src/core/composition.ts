import { createHash } from 'node:crypto';

export type Source = { readonly name: string; readonly kind: string; readonly document: string; readonly pin: string; readonly offers: readonly string[] };
export type Selection = { readonly source: string; readonly namespace: string; readonly offers: readonly string[] };
export type Author = { readonly name: string; readonly email?: string; readonly url?: string };
export type Recipe = { readonly id: string; readonly revision: string; readonly title: string; readonly description: string; readonly sources: readonly Selection[]; readonly author?: Author };
const name = /^[a-z][a-z0-9-]*$/;
const digest = /^sha256:[a-f0-9]{64}$/;
/** A selection of already interpreted, authenticated sources. It neither interprets a document nor grants an action. */
export function compose(recipe: Recipe, sources: readonly Source[], most: number) {
  if (!Number.isSafeInteger(most) || most < 1 || !name.test(recipe.id) || !/^\d+\.\d+\.\d+$/.test(recipe.revision) || !recipe.title.trim() || !recipe.description.trim()
    || recipe.sources.length < 1 || recipe.sources.length > most) throw Error('composition/recipe');
  if (recipe.author && (typeof recipe.author.name !== 'string' || !recipe.author.name.trim() || Object.keys(recipe.author).some(key => !['name', 'email', 'url'].includes(key)) || (recipe.author.email !== undefined && (typeof recipe.author.email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(recipe.author.email))) || (recipe.author.url !== undefined && (typeof recipe.author.url !== 'string' || !URL.canParse(recipe.author.url) || new URL(recipe.author.url).href !== new URL(recipe.author.url).origin + new URL(recipe.author.url).pathname)))) throw Error('composition/author');
  const namespaces = new Set<string>(), selected = new Set<string>();
  const entries = recipe.sources.map(choice => {
    if (!name.test(choice.namespace) || namespaces.has(choice.namespace) || selected.has(choice.source)) throw Error('composition/collision');
    namespaces.add(choice.namespace); selected.add(choice.source);
    const found = sources.filter(source => source.name === choice.source);
    if (found.length !== 1) throw Error('composition/source');
    const source = found[0]!;
    if (!digest.test(source.pin) || !digest.test(source.document) || !source.kind.trim()) throw Error('composition/pin');
    if (!choice.offers.length || choice.offers.length > most || new Set(choice.offers).size !== choice.offers.length
      || choice.offers.some(offer => !source.offers.includes(offer))) throw Error('composition/offer');
    return { source: source.name, namespace: choice.namespace, kind: source.kind, document: source.document, pin: source.pin, offers: [...choice.offers].sort() };
  }).sort((a, b) => a.namespace < b.namespace ? -1 : a.namespace > b.namespace ? 1 : 0);
  const bytes = Buffer.from(JSON.stringify({ protocol: 'head-composition@1', id: recipe.id, revision: recipe.revision, title: recipe.title, description: recipe.description, ...(recipe.author ? { author: { name: recipe.author.name, ...(recipe.author.email ? { email: recipe.author.email } : {}), ...(recipe.author.url ? { url: recipe.author.url } : {}) } } : {}), sources: entries }) + '\n');
  return { bytes, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, entries };
}
