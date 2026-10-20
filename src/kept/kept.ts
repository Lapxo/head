import type { Said } from '../core/lock.ts';
import { receiptsOf } from '../core/receipt.ts';

/** The typed answers this conversation already holds, by digest: head is one process a conversation, so they last as long as it. */
const handed = new Set<string>();
export const hand = (digest: string): string => (handed.add(digest), digest);

type Held = (digest: string | undefined) => { readonly digest: string; readonly bytes: Uint8Array } | undefined;
export type Was = { readonly kind: 'kept'; readonly at: string; readonly digest: string; readonly receipt: string; readonly bytes?: Uint8Array }
  | { readonly kind: 'reread'; readonly at: string; readonly digest: string; readonly bytes: Uint8Array } | { readonly kind: 'again'; readonly at: string; readonly why: 'withdrawn' | 'changed' | 'expired' };

/**
 * A question read before, as its receipts and the place stand now. Where the place declares a reuse and the newest read
 * stood, it is kept — its bytes only where this conversation does not hold them yet — or typed again from its receipt if
 * nothing typed was kept; but read again, and why, where the person's grant had to be given again, the source is pinned
 * otherwise than when it was read, or the read is older than the reuse allows. Never read, or no reuse: nothing is said.
 */
export const keptOf = (lines: readonly Said[], at: string, [read, kept]: readonly [string, string], granted: boolean, reuse: string | undefined, now: number, held: Held): Was | undefined => {
  const [newest] = receiptsOf(lines, at, read), body = held(newest?.digest), window = Number(/^\d+\.\.(\d+)$/.exec(reuse ?? '')?.[1] ?? Number.NaN);
  if (newest === undefined || body === undefined || Number.isNaN(window) || Number(Buffer.from(body.bytes.subarray(0, body.bytes.indexOf(10))).toString('utf8')) >= 300) return undefined;
  const typed = receiptsOf(lines, at, kept.slice(0, kept.lastIndexOf('/')), true).filter((k) => k.at >= newest.at), answered = held(typed.find((k) => k.scope === kept)?.digest);
  const why = !granted ? 'withdrawn' : typed.length && !typed.some((k) => k.scope === kept) ? 'changed' : now - Date.parse(newest.at) > window * 1000 ? 'expired' : undefined;
  if (why !== undefined) return { kind: 'again', at: newest.at, why };
  return answered === undefined ? { kind: 'reread', at: newest.at, digest: body.digest, bytes: body.bytes } : { kind: 'kept', at: newest.at, digest: answered.digest, receipt: newest.digest, ...(handed.has(answered.digest) ? {} : { bytes: answered.bytes }) };
};
