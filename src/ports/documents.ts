import { dirname, extname, join } from 'node:path';
import type { Attachment } from '../access/contract.ts';
import { within } from '../core/answer.ts';
import type { Context } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import type { Call } from '../core/read.ts';
import { sayIn } from '../core/surface.ts';

export type Read = { readonly bytes: Uint8Array; readonly kind: string };
const limits = (context: Context) => ['adapter/request/wait', 'adapter/request/document-bytes'].map((k) => Number(valueOf(context.lock, k).split('..')[1])) as [number, number];

export const kindOf = (at: string, type = ''): string => (extname(URL.canParse(at) ? new URL(at).pathname : at).slice(1)
  || (type.split(';')[0]!.split('/')[1] ?? '').split('+').at(-1)!.replace(/^x-/, '') || 'octet-stream').toLowerCase();

/**
 * A document the person names: a file inside the place or a folder the client shares, or an encrypted address read with
 * nothing attached — signed or expiring as it may be — and, when its digest is named, followed wherever it moves to the
 * bytes that digest names, and only to them. Anything else is not read. Its kind is named, never read for: its file's
 * extension, its address's, or the media type it was served as; bytes that say none are octet-stream.
 */
export const documentOf = async (context: Context, place: string, at: string, named = ''): Promise<Read | undefined> => {
  const [wait, most] = limits(context), transport = URL.canParse(at) ? await context.adapter(at) : undefined;
  if (URL.canParse(at)) return named ? ((bytes) => bytes && { bytes, kind: kindOf(at) })(await transport?.published(at, named, most, wait)) : ((got) => got && { bytes: got.bytes, kind: kindOf(at, got.type) })(await transport?.get(at, wait));
  return ((bytes) => bytes && { bytes, kind: kindOf(at) })((await within(context, place, at)) ? context.files.take(at) : undefined);
};

/** A document read with the access a source the place connected holds: sent to that source's own origin alone, never redirected with it; a move is followed with nothing attached, only to the bytes its named digest names. */
export const fetchedAs = async (context: Context, at: string, via: string, got: { readonly plan: Call; readonly attachment: Attachment | undefined }, named: string, accept: string | undefined): Promise<Read | { readonly said: readonly string[] }> => {
  const [say, [wait, most]] = [sayIn(context.lock), limits(context)];
  if (!URL.canParse(at)) return { said: [say('document-unread', { document: at })] };
  if (new URL(at).origin !== new URL(got.plan.origin).origin) return { said: [say('fetch-cross-origin', { document: at, via })] };
  const transport = await context.adapter(at), answer = transport ? await transport.fetched(at, got.attachment, accept, most, wait) : undefined;
  if (answer?.kind !== 'got') return { said: [say('document-unread', { document: at })] };
  if (answer.status >= 300 && answer.status < 400 && answer.location !== undefined) {
    if (!named) return { said: [say('fetch-redirect', { document: at })] };
    return ((bytes) => (bytes ? { bytes, kind: kindOf(at) } : { said: [say('document-unread', { document: at })] }))(await transport!.published(new URL(answer.location, at).href, named, most, wait));
  }
  return answer.status < 300 ? { bytes: answer.bytes, kind: kindOf(at, answer.type) } : { said: [say('fetch-status', { document: at, via, status: String(answer.status), at: new Date(context.now()).toISOString() })] };
};

/**
 * Every byte a package's lines name, by the path each names: read where a line of the same scope says — an encrypted
 * address, signed or expiring, read with nothing attached and only to the bytes its digest names — or else beside the
 * package's lock, in its folder or at its address. A path outside the package is never read. And what a place laid
 * for a source it connected — its document and the overlay beside it — by the path the place keeps them at. And where
 * an origin says its documents are: the catalog it publishes at its well-known address (RFC 9727), then the paths head's
 * lock names, each once.
 */
export const besideOf = async (context: Context, document: string, lines: readonly Said[]): Promise<ReadonlyMap<string, Uint8Array | undefined>> => {
  const [wait, most] = limits(context), read = new Map<string, Uint8Array | undefined>();
  for (const l of lines.filter((one) => one.needs && one.measure === 'digest' && !one.needs.split('/').includes('..') && !one.needs.startsWith('/'))) {
    const at = lines.find((o) => o.scope === l.scope && o.measure === 'id')?.value ?? (URL.canParse(document) ? new URL(l.needs!, document).href : join(dirname(document), l.needs!));
    read.set(l.needs!, URL.canParse(at) ? await (await context.adapter(at))?.published(at, l.value ?? '', most, wait) : context.files.take(at));
  }
  return read;
};

export const describedAt = async (context: Context, origin: string): Promise<readonly string[]> => {
  const [wait] = limits(context), catalog = await (await context.adapter(origin))?.get(new URL(valueOf(context.lock, 'use/catalog'), origin).href, wait), rel = valueOf(context.lock, 'use/catalog-rel');
  const listed = ((): readonly string[] => { try { return (JSON.parse(new TextDecoder().decode(catalog?.bytes ?? new Uint8Array())) as { linkset?: Record<string, { href?: string }[]>[] }).linkset?.flatMap((l) => (l[rel] ?? []).flatMap((d) => d.href ?? [])) ?? []; } catch { return []; } })();
  return [...new Set([...listed, ...members(valueOf(context.lock, 'use/documents'))].flatMap((at) => (URL.canParse(at, origin) ? [new URL(at, origin).href] : [])))];
};
export const laidOf = (context: Context, place: string, source: string): readonly (readonly [string, Uint8Array])[] => ((at) => context.files.list(place, at).filter((f) => new RegExp(`^${source}\\.(overlay\\.)?[^.]+$`).test(f))
  .map((f) => [`${at}/${f}`, context.files.take(join(place, at, f)) ?? new Uint8Array()] as const))(valueOf(context.lock, 'place/connected'));
