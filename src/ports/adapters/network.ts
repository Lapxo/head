import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { request } from 'node:https';
import { Readable } from 'node:stream';
import type { PermittedFetch } from './mcp.ts';

export interface NetworkPolicy { readonly internal?: readonly { readonly hostname: string; readonly address: string }[]; readonly ca?: string }
const excluded = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) excluded.addSubnet(net, bits);
for (const [net, bits] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) excluded.addSubnet(net, bits, 'ipv6');
const global = new BlockList(); global.addSubnet('2000::', 3, 'ipv6');
export const publicAddress = (address: string): boolean => isIP(address) === 4 ? !excluded.check(address) : isIP(address) === 6 && global.check(address, 'ipv6') && !excluded.check(address, 'ipv6');
/** Receiver-owned transport: payloads cannot supply DNS policy, private bindings, trust roots or credentials. */
export function networkFor(endpoint: string, policy: NetworkPolicy = {}, resolve = lookup): PermittedFetch {
  const target = new URL(endpoint);
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash || target.href !== endpoint) throw Error('mcp/endpoint');
  return async (url, init) => {
    if (url !== endpoint || !['GET', 'POST', 'DELETE'].includes(init.method ?? 'GET') || init.redirect !== 'manual' || init.credentials !== 'omit' || !init.signal) throw Error('mcp/network-policy');
    const signal = init.signal; signal.throwIfAborted();
    const host = target.hostname.replace(/^\[|\]$/g, '');
    let abort!: () => void;
    const stopped = new Promise<never>((_, reject) => { abort = () => reject(Error('mcp/cancelled')); signal.addEventListener('abort', abort, { once: true }); });
    let addresses: LookupAddress[];
    try { addresses = await Promise.race([resolve(host, { all: true, verbatim: true }), stopped]); }
    finally { signal.removeEventListener('abort', abort); }
    signal.throwIfAborted();
    if (!addresses.length || addresses.some(({ address }) => !publicAddress(address) && !policy.internal?.some(one => one.hostname === host && one.address === address))) throw Error('mcp/destination');
    const chosen = addresses[0]!;
    const headers = Object.fromEntries(new Headers(init.headers));
    if (Object.keys(headers).some(k => ['host', 'connection', 'transfer-encoding', 'content-length', 'proxy-authorization', 'cookie'].includes(k)) || Buffer.byteLength(JSON.stringify(headers)) > 16384) throw Error('mcp/headers');
    const body = init.body;
    if (body !== undefined && body !== null && typeof body !== 'string' && !(body instanceof Uint8Array)) throw Error('mcp/request-body');
    if (body && Buffer.byteLength(body) > 16777216) throw Error('mcp/request-budget');
    return new Promise<Response>((resolveResponse, reject) => {
      const req = request(target, { method: init.method, headers, agent: false, signal, rejectUnauthorized: true, maxHeaderSize: 16384, ...(policy.ca ? { ca: policy.ca } : {}), family: chosen.family,
        lookup: (_hostname, options, done) => options.all ? done(null, [chosen]) : done(null, chosen.address, chosen.family) }, response => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) for (const item of Array.isArray(value) ? value : [value]) responseHeaders.append(name, item);
        const status = response.statusCode ?? 500;
        if ([204, 205, 304].includes(status)) { response.resume(); resolveResponse(new Response(null, { status, headers: responseHeaders })); }
        else resolveResponse(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, { status, headers: responseHeaders }));
      });
      req.on('error', () => reject(Error(signal.aborted ? 'mcp/cancelled' : 'mcp/transport')));
      if (body) req.write(body); req.end();
    });
  };
}
