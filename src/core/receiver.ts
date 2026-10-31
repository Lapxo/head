import { configuredPackage } from '../ports/adapters/configured.ts';
import { join } from 'node:path';
import { LOCK } from '@lapxo/topos/wire';
import type { Asked, Context } from './answer.ts';
import { baseOf, unless } from './answer.ts';
import { valueOf } from './lock.ts';
import { shapeOf } from '../ports/surface.ts';
import { sayIn } from './surface.ts';
import { compose, type Recipe, type Source } from './composition.ts';
import { digestIn, linesOf } from './worlds.ts';
import { unpacked } from './package.ts';
import { associationFor, associationLines } from './association.ts';
import { received, laidIn } from '../sources/connect.ts';
import { rootIn, homeIndex } from '../flows/device.ts';
import { bundleRefusal } from './share-bundle.ts';
import { bornAt } from '../places/found.ts';

/** Inspect only public installed data. Identity is integrity, never sender authentication or permission. */
async function material(context: Context) {
  const port = await context.packaged?.(), selection = port?.read('composition/selection.json');
  if (!port || !selection) return undefined;
  const selected = JSON.parse(Buffer.from(selection).toString()), manifest = JSON.parse(Buffer.from(port.read('manifest.json') ?? []).toString());
  if (selected.protocol !== 'head-composition@1' || !Array.isArray(selected.sources) || manifest.name !== selected.id || manifest.version !== selected.revision) throw Error('bundle/identity');
  const recipe: Recipe = { id: selected.id, revision: selected.revision, title: selected.title, description: selected.description, ...(selected.author ? { author: selected.author } : {}), sources: selected.sources.map((s: any) => ({ source: s.source, namespace: s.namespace, offers: s.offers })) };
  if (selected.author && JSON.stringify(manifest.author) !== JSON.stringify(selected.author)) throw Error('bundle/identity');
  const sources: Source[] = selected.sources.map((s: any) => ({ name: s.source, kind: s.kind, document: s.document, pin: s.pin, offers: s.offers }));
  const made = compose(recipe, sources, Number(valueOf(context.lock, 'share/bundle-selections').split('..')[1]));
  if (!Buffer.from(made.bytes).equals(Buffer.from(selection))) throw Error('bundle/selection');
  const bytes = port.read(`composition/${LOCK}`); if (!bytes) throw Error('bundle/public-lock');
  const files = new Map<string, Uint8Array | undefined>();
  for (const line of linesOf(bytes)) if (line.needs) files.set(line.needs, port.read(`composition/${line.needs}`));
  const documents = configuredPackage(context, files);
  const document = join(port.root, 'composition', LOCK), got = unpacked(context, document, bytes, files), digest = digestIn(context.lock);
  if (!got.sources || got.open.length || got.sources.length !== sources.length || sources.some(s => s.kind !== 'compiled' || !got.sources!.some(g => g.source === s.name && g.pin === s.pin && digest(g.document.bytes) === s.document))) throw Error('bundle/public-package');
  const identity = { id: recipe.id, revision: recipe.revision, digest: digest(Buffer.from(JSON.stringify([digest(selection), digest(bytes)]))) };
  return { identity, document, lockDigest: digest(bytes), bytes, files, documents, sources, selection: made.entries };
}
async function associated(context: Context, payload: NonNullable<Awaited<ReturnType<typeof material>>>) {
  const index = await homeIndex(context);
  if ('refused' in index) throw Error('bundle/index-unread');
  return { index: index.lines, plan: associationFor(valueOf(context.lock, 'bundle/association-family'), payload.identity, index.lines) };
}
const localName = async (context: Context, place: string, fallback: string) => {
  const index = await homeIndex(context); if ('refused' in index) throw Error('bundle/index-unread');
  const family = valueOf(context.lock, 'home/family') + '/';
  const names = [...new Set(index.lines.filter(l => l.scope?.startsWith(family) && l.value === place).map(l => l.scope!.slice(family.length)))];
  if (names.length > 1) throw Error('bundle/place-ambiguous');
  return names[0] ?? fallback;
};
const validPins = async (context: Context, place: string, sources: readonly Source[]) => {
  if (!context.files.has(place, LOCK)) return false;
  const held = await context.policy(place);
  return !('refused' in held) && sources.every(s => held.lines.some(l => l.scope === `uses/${s.name}` && l.value === s.pin));
};
/** Questions only describe the required connect, or route an already associated package; they never import or grant. */
export async function receiverQuestion(asked: Asked, context: Context): Promise<{ place: string } | { said: readonly string[] } | undefined> {
  try {
    const payload = await material(context); if (!payload || asked['place']) return undefined;
    const { plan } = await associated(context, payload);
    if (plan.state === 'collision') throw Error('bundle/revision-collision');
    if (plan.state === 'same' && plan.place && await validPins(context, plan.place, payload.sources)) return { place: plan.place };
    return { said: [sayIn(context.lock)('bundle-receiver-ready', { document: payload.document, digest: payload.lockDigest, name: payload.identity.id, revision: payload.identity.revision, place: plan.place })] };
  } catch (error) { return { said: bundleRefusal(context, error) }; }
}
/** Existing connect does the import; only its successful exact pins allow the receiver-owned association. */
export async function receiverConnect(asked: Asked, context: Context): Promise<readonly string[] | undefined> {
  const say = sayIn(context.lock);
  try {
    const payload = await material(context); if (!payload || asked['document'] !== payload.document) return undefined;
    if (asked['digest'] !== payload.lockDigest) throw Error('bundle/document-digest');
    const { plan } = await associated(context, payload); if (plan.state === 'collision') throw Error('bundle/revision-collision');
    const place = asked['place'] || plan.place || join(context.personal(), valueOf(context.lock, 'bundle/receiver-folder'), payload.identity.id);
    if (plan.state === 'same' && plan.place === place && await validPins(context, place, payload.sources)) return [say('bundle-associated', { place, name: await localName(context, place, `bundle-${payload.identity.id}`), package: payload.identity.id, revision: payload.identity.revision })];
    const refused = await unless(context, say('elicit-bundle-receive', { name: payload.identity.id, revision: payload.identity.revision, place, sources: payload.sources.map(s => { const doc = payload.documents.find(doc => doc.configuration.name === s.name); return doc ? `${s.name} (${doc.configuration.endpoint})` : s.name; }).join(', ') }));
    if (refused) return refused;
    if (!context.files.has(place, LOCK)) { const born = await bornAt(context, place, `bundle-${payload.identity.id}`); if (!context.files.has(place, LOCK)) return born; }
    const root = await rootIn(context, place); if ('said' in root) return root.said;
    const imported = await received(context, place, payload.document, payload.bytes, payload.lockDigest, laidIn(context, place, root.account), root.account, payload.files);
    if (shapeOf(imported).cells.some(cell => ['refused', 'open'].includes(cell.state)) || !await validPins(context, place, payload.sources)) return imported;
    const home = await rootIn(context, context.home()); if ('said' in home) return [...imported, ...home.said];
    const current = await context.policy(context.home()); if ('refused' in current) throw Error('bundle/index-unread');
    const fresh = associationFor(valueOf(context.lock, 'bundle/association-family'), payload.identity, current.lines);
    const lot = associationLines(fresh, place, true, `policy:head/bundle/${payload.identity.id}/${baseOf(current.lines)}`), landed = lot.length ? await context.landRoot(context.home(), lot, home.account) : undefined;
    return landed && 'refused' in landed ? [...imported, say('not-landed', { why: landed.refused })] : [...imported, say('bundle-associated', { place, name: await localName(context, place, `bundle-${payload.identity.id}`), package: payload.identity.id, revision: payload.identity.revision })];
  } catch (error) { return bundleRefusal(context, error); }
}
/** Selection narrows this packaged surface; it never grants a call or replaces Bound's authority checks. */
export async function receiverAllows(context: Context, place: string, source: string, operation: string): Promise<boolean> {
  const payload = await material(context); if (!payload) return true;
  const { plan } = await associated(context, payload);
  return plan.state === 'same' && plan.place === place && await validPins(context, place, payload.sources) && payload.selection.some(s => s.source === source && s.offers.includes(operation));
}
