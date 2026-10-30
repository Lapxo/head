import { createHash } from 'node:crypto';
export interface Tool { readonly name: string; readonly inputSchema: { readonly type: 'object' }; readonly annotations?: { readonly readOnlyHint?: boolean }; readonly [key: string]: unknown }
export interface Options { readonly signal: AbortSignal; readonly timeout: number }
export interface ClientPort {
  readonly list: (after: string | undefined, options: Options) => Promise<{ tools: Tool[]; next?: string }>;
  readonly callTool: (params: { name: string; arguments: Record<string, unknown> }, options: Options) => Promise<unknown>;
  readonly close: () => Promise<void>;
}
export interface Limits { readonly pages: number; readonly tools: number; readonly bytes: number; readonly milliseconds: number }
export const fingerprint = (tools: readonly Tool[]) => {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, stable(child)])) : value;
  const bytes = Buffer.from(JSON.stringify(stable([...tools].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0))));
  return { tools, bytes, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
};
/** The host supplies an already permitted transport. Discovery observes a catalogue; hints never authorize a call. */
export async function withCatalogue<T>(connect: (options: Options) => Promise<ClientPort>, limits: Limits, signal: AbortSignal | undefined,
  use: (session: { readonly read: () => Promise<ReturnType<typeof fingerprint>>; readonly call: (pin: string, tool: string, args: Record<string, unknown>, authorize: () => Promise<boolean>) => Promise<unknown> }) => Promise<T>): Promise<T> {
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value < 1)) throw Error('mcp/budget');
  let client: ClientPort | undefined;
  const stop = AbortSignal.any([AbortSignal.timeout(limits.milliseconds), ...(signal ? [signal] : [])]);
  const close = () => { void client?.close().catch(() => {}); }; stop.addEventListener('abort', close, { once: true });
  const options = { signal: stop, timeout: limits.milliseconds };
  try {
    stop.throwIfAborted(); client = await connect(options); const connected = client;
    const read = async () => {
      const tools: Tool[] = [], names = new Set<string>(), pages = new Set<string>(); let after: string | undefined, size = 0;
      for (let page = 0; page < limits.pages; page++) {
        stop.throwIfAborted(); const result = await connected.list(after, options);
        size += Buffer.byteLength(JSON.stringify(result));
        if (size > limits.bytes || tools.length + result.tools.length > limits.tools) throw Error('mcp/budget');
        for (const tool of result.tools) { if (names.has(tool.name)) throw Error('mcp/collision'); names.add(tool.name); tools.push(tool); }
        after = result.next;
        if (after === undefined) return fingerprint(tools);
        if (!after || pages.has(after)) throw Error('mcp/page-loop'); pages.add(after);
      }
      throw Error('mcp/budget');
    };
    return await use({ read, call: async (pin, tool, args, authorize) => {
      const current = await read();
      if (current.digest !== pin) throw Error('mcp/catalogue-changed');
      if (!current.tools.some(entry => entry.name === tool)) throw Error('mcp/tool');
      if (!await authorize()) throw Error('mcp/not-authorized');
      if ((await read()).digest !== pin) throw Error('mcp/catalogue-changed');
      stop.throwIfAborted(); return connected.callTool({ name: tool, arguments: args }, options);
    } });
  } finally { stop.removeEventListener('abort', close); await client?.close(); }
}

export interface ConfiguredSource { readonly protocol: 'head-configured-mcp@1'; readonly name: string; readonly endpoint: string; readonly catalogue: string; readonly offers: readonly string[] }
export type PermittedFetch = (url: string, init: RequestInit) => Promise<Response>;
export type RemoteFactory = (endpoint: string, send: PermittedFetch, options: Options) => Promise<ClientPort>;
/** Public configuration contains no execution, environment, headers or credentials. A URL never supplies a network capability. */
export function configuredSource(value: unknown): ConfiguredSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('mcp/configuration');
  const one = value as Record<string, unknown>;
  if (Object.keys(one).sort().join('|') !== 'catalogue|endpoint|name|offers|protocol' || one['protocol'] !== 'head-configured-mcp@1'
    || typeof one['name'] !== 'string' || !/^[a-z][a-z0-9-]*$/.test(one['name']) || typeof one['catalogue'] !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(one['catalogue'])
    || typeof one['endpoint'] !== 'string' || !URL.canParse(one['endpoint']) || !Array.isArray(one['offers']) || !one['offers'].length || one['offers'].some(n => typeof n !== 'string' || !n.trim()) || new Set(one['offers']).size !== one['offers'].length) throw Error('mcp/configuration');
  const url = new URL(one['endpoint']);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.href !== one['endpoint']) throw Error('mcp/endpoint');
  return { protocol: 'head-configured-mcp@1', name: one['name'], endpoint: url.href, catalogue: one['catalogue'], offers: [...one['offers']] as string[] };
}
/** The host grants every connection, including DNS/address policy and receiver-only credentials, through its fetch capability. */
export async function withConfiguredSource<T>(configuration: ConfiguredSource, factory: RemoteFactory, permitted: PermittedFetch | undefined,
  limits: Limits & { readonly wireBytes: number }, signal: AbortSignal | undefined, use: (call: (tool: string, args: Record<string, unknown>, authorize: () => Promise<boolean>) => Promise<unknown>) => Promise<T>): Promise<T> {
  const source = configuredSource(configuration);
  if (!permitted) throw Error('mcp/network-unavailable');
  if (!Number.isSafeInteger(limits.wireBytes) || limits.wireBytes < 1) throw Error('mcp/budget');
  if (source.offers.length > limits.tools || Buffer.byteLength(JSON.stringify(source)) > limits.bytes) throw Error('mcp/budget');
  return withCatalogue(options => factory(source.endpoint, transportFor(source.endpoint, permitted, limits.wireBytes, options), options), limits, signal, async session => {
    const current = await session.read();
    if (current.digest !== source.catalogue || source.offers.some(name => !current.tools.some(tool => tool.name === name))) throw Error('mcp/catalogue-changed');
    return use((tool, args, authorize) => {
      if (!source.offers.includes(tool)) return Promise.reject(Error('mcp/tool'));
      return session.call(source.catalogue, tool, args, authorize);
    });
  });
}

/** One bounded SDK session; redirects and ambient credentials are never inherited. */
export function transportFor(endpoint: string, permitted: PermittedFetch, wireBytes: number, options: Options): PermittedFetch {
  if (!Number.isSafeInteger(wireBytes) || wireBytes < 1) throw Error('mcp/budget');
  let bytes = 0;
  return async (url, init) => {
    if (url !== endpoint || !['GET', 'POST', 'DELETE'].includes(init.method ?? 'GET')) throw Error('mcp/endpoint');
    options.signal.throwIfAborted();
    const got = await permitted(url, { ...init, redirect: 'manual', credentials: 'omit', signal: options.signal });
    if (got.status >= 300 && got.status < 400) { await got.body?.cancel(); throw Error('mcp/redirect'); }
    const body = got.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
      options.signal.throwIfAborted(); bytes += chunk.byteLength;
      if (bytes > wireBytes) throw Error('mcp/budget');
      controller.enqueue(chunk);
    } }));
    return new Response(body ?? null, { status: got.status, statusText: got.statusText, headers: got.headers });

  };
}

export { remoteFactory } from './protocol.ts';
