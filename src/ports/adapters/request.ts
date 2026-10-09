import { createHash } from 'node:crypto';
import { valueOf } from '../../core/lock.ts';
import type { Said } from '../../core/lock.ts';
import type { Call } from '../../core/read.ts';
import { jsonOf } from '../../access/contract.ts';
import type { Attachment } from '../../access/contract.ts';

export type Fetched = { readonly kind: 'got'; readonly status: number; readonly bytes: Uint8Array; readonly type: string } | { readonly kind: 'over' } | { readonly kind: 'failed' };
export type Prepared = { readonly key: string; readonly describe: string; readonly send: (attachment: Attachment | undefined, most: number) => Promise<Fetched> } | { readonly missing: string } | { readonly refused: string };

/**
 * One request, stopped as soon as the body runs past the bytes it may hold or the wait runs out, its stream released
 * either way; nothing is retried. No redirect is followed, but to bytes a digest pins: asked with no header and no body,
 * so a secret stays with its origin, and answered only when they hash to the pin, their integrity and never the address.
 */
const requestCapped = async (method: string, url: string, headers: Readonly<Record<string, string>>, body: string | undefined, most: number, wait: number, redirect: RequestRedirect = 'manual'): Promise<Fetched> => {
  try {
    const response = await fetch(url, { method, headers, body, redirect: redirect === 'follow' && !Object.keys(headers).length && body === undefined ? 'follow' : 'manual', signal: AbortSignal.timeout(wait) });
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body ?? []) {
      size += chunk.byteLength;
      if (size > most) break;
      chunks.push(chunk);
    }
    return size > most ? { kind: 'over' } : { kind: 'got', status: response.status, bytes: Buffer.concat(chunks), type: response.headers.get('content-type') ?? '' };
  } catch { return { kind: 'failed' }; }
};

const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);

export const published = async (url: string, digest: string, most: number, wait: number): Promise<Uint8Array | undefined> => (URL.canParse(url) && new URL(url).protocol === 'https:'
  ? ((got) => (got.kind === 'got' && got.status < 300 && `sha256:${createHash('sha256').update(got.bytes).digest('hex')}` === digest ? got.bytes : undefined))(await requestCapped('GET', url, {}, undefined, most, wait, 'follow')) : undefined);

export const get = async (url: string, wait: number): Promise<{ readonly bytes: Uint8Array; readonly type: string } | undefined> => (URL.canParse(url) && new URL(url).protocol === 'https:' ? ((got) => (got.kind === 'got' && got.status < 300 ? got : undefined))(await requestCapped('GET', url, {}, undefined, 16_777_216, wait)) : undefined);

/** A body posted to an address a declaration names — as a form, or as JSON where the declaration's protocol asks it — as one request under the same rules: encrypted unless it is this device, capped, never redirected. */
export const post = async (url: string, body: Readonly<Record<string, unknown>>, most: number, wait: number, as: 'form' | 'json' = 'form'): Promise<{ readonly status: number; readonly json: unknown } | undefined> => {
  if (!URL.canParse(url) || !((at) => at.protocol === 'https:' || loopback.has(at.hostname))(new URL(url))) return undefined;
  const got = await requestCapped('POST', url, { 'content-type': as === 'json' ? 'application/json' : 'application/x-www-form-urlencoded', accept: 'application/json' },
    as === 'json' ? JSON.stringify(body) : new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])).toString(), most, wait);
  return got.kind === 'got' ? { status: got.status, json: jsonOf(got.bytes) } : undefined;
};

/**
 * The request an offer's carry describes: its method and path, the path and query parameters its form names filled from
 * what was asked, its body, and the headers and query members an access adapter attaches — only when it is sent, never
 * in the request's key or its description. Plain transport reaches loopback only; anything else must be encrypted.
 */
export const prepare = (call: Call, args: Readonly<Record<string, unknown>>, lock: readonly Said[]): Prepared => {
  const word = (key: string) => valueOf(lock, `adapter/request/${key}`);
  const [method, ...more] = call.carry['method'] ?? [];
  const [template, ...paths] = call.carry['path'] ?? [];
  if (method === undefined || template === undefined || more.length || paths.length) return { refused: 'carry-unsettled' };
  const origin = ((at) => (at !== undefined && (at.protocol === 'https:' || loopback.has(at.hostname)) ? at : undefined))(URL.canParse(call.origin) ? new URL(call.origin) : undefined);
  if (origin === undefined) return { refused: 'insecure-origin' };
  const named = (where: string) => (call.form['params'] ?? []).filter((p) => p.startsWith(`${where}:`)).map((p) => p.slice(where.length + 1));
  const missing = named('path').find((p) => args[p] === undefined);
  if (missing !== undefined) return { missing };
  const path = named('path').reduce((at, p) => at.split(`{${p}}`).join(encodeURIComponent(String(args[p]))), template);
  const query = new URLSearchParams(named('query').flatMap((p) => (args[p] === undefined ? [] : [[p, String(args[p])]])));
  const url = `${origin.href.replace(/\/$/, '')}${path}${query.size ? `?${query}` : ''}`;
  const body = args['body'] === undefined ? undefined : JSON.stringify(args['body']);
  const key = createHash('sha256').update(`${method.toUpperCase()} ${url} ${body ?? 'null'}`).digest('hex');
  const idempotency = call.carry['idempotency']?.[0];
  const send = (attachment: Attachment | undefined, most: number): Promise<Fetched> => {
    const extra = new URLSearchParams(Object.entries(attachment?.query ?? {}));
    const sent = extra.size ? `${url}${query.size ? '&' : '?'}${extra}` : url;
    return requestCapped(method.toUpperCase(), sent, { ...(attachment?.headers ?? {}), ...(idempotency ? { [idempotency]: key } : {}), ...(body === undefined ? {} : { [word('content-type')]: word('json') }) }, body, most, Number(word('wait').split('..')[1]));
  };
  return { key, describe: `${method.toUpperCase()} ${url}`, send };
};
