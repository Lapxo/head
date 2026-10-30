import { createHash } from 'node:crypto';
import { transportFor, withCatalogue, withConfiguredSource, remoteFactory, type ConfiguredSource, type Limits, type PermittedFetch } from './mcp.ts';
import { networkFor } from './network.ts';
import type { Attachment } from '../../access/contract.ts';
import type { Prepared } from './request.ts';

export interface RemotePort {
  readonly discover: (endpoint: string) => Promise<{ readonly tools: readonly import('./mcp.ts').Tool[]; readonly digest: string }>;
  readonly prepare: (source: ConfiguredSource, tool: string, args: Record<string, unknown>, authorize: () => Promise<boolean>) => Prepared;
}
/** This port owns no permission. Callers bind the receiver's consent and existing access flow; SDK hints grant nothing. */
export function remoteAt(limits: Limits & { readonly wireBytes: number }, signal?: AbortSignal, network: (endpoint: string) => PermittedFetch = networkFor): RemotePort {
  return {
    discover: endpoint => withCatalogue(options => remoteFactory(endpoint, transportFor(endpoint, network(endpoint), limits.wireBytes, options), options), limits, signal, session => session.read()),
    prepare: (source, tool, args, authorize) => {
      if (!source.offers.includes(tool)) return { refused: 'mcp-tool' };
      const sentArgs = JSON.parse(JSON.stringify(args)) as Record<string, unknown>;
      const key = createHash('sha256').update(JSON.stringify([source.endpoint, source.catalogue, tool, sentArgs])).digest('hex');
      return { key, describe: `${source.endpoint} · ${tool} · sha256:${key}`, send: async (attachment: Attachment | undefined, most: number) => {
        if (!Number.isSafeInteger(most) || most < 1 || Object.keys(attachment?.query ?? {}).length) return { kind: 'failed', why: 'mcp/access-location' };
        try {
          const permitted = network(source.endpoint);
          const result = await withConfiguredSource(source, remoteFactory, (url, init) => {
            const headers = new Headers(init.headers);
            for (const [key, value] of Object.entries(attachment?.headers ?? {})) headers.set(key, value);
            return permitted(url, { ...init, headers });
          }, limits, signal, call => call(tool, sentArgs, authorize));
          const bytes = Buffer.from(JSON.stringify(result));
          return bytes.length > most ? { kind: 'over' } : { kind: 'got', status: 200, bytes, type: 'application/json' };
        } catch (error) { return { kind: 'failed', why: error instanceof Error && /^mcp\/[a-z-]+$/.test(error.message) ? error.message : 'mcp/transport' }; }
      } };
    },
  };
}
