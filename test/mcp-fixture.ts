import { equal } from 'node:assert/strict';
import { createServer, request } from 'node:https';
import { Readable } from 'node:stream';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { PermittedFetch } from '../src/ports/adapters/mcp.ts';
export async function fixture(domain: string, extraTools: readonly import('../src/ports/adapters/mcp.ts').Tool[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'head-configured-')), key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-keyout', key, '-out', cert], { stdio: 'ignore' });
  let calls = 0, drift = false, redirect = false; const requests: string[] = [];
  const tool = { name: domain, inputSchema: { type: 'object' as const, properties: { value: { type: 'number' } } }, annotations: { readOnlyHint: true } };
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, async (req, res) => {
    requests.push(req.url ?? ''); if (redirect) { res.writeHead(302, { location: 'https://127.0.0.1/private' }); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    const chunks = []; for await (const c of req) chunks.push(c); const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.id === undefined) { res.writeHead(202); res.end(); return; }
    const result = body.method === 'initialize' ? { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: domain, version: '1' } }
      : body.method === 'tools/list' ? { tools: [{ ...tool, ...(drift ? { description: 'changed' } : {}) }, ...extraTools] }
      : body.method === 'tools/call' ? (calls++, { content: [{ type: 'text', text: domain + ':' + body.params.arguments.value }] }) : {};
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `https://localhost:${(server.address() as { port: number }).port}/tenant/service/mcp`, ca = readFileSync(cert);
  const send: PermittedFetch = (url, init) => {
    equal(url, endpoint, 'the fixture cannot reach any third-party endpoint'); equal(init.redirect, 'manual');
    return new Promise((resolve, reject) => {
      const req = request(url, { family: 4, method: init.method, headers: Object.fromEntries(new Headers(init.headers)), ca, lookup: (_host, _opts, done) => done(null, '127.0.0.1', 4), signal: init.signal ?? undefined }, res => resolve(new Response(res.statusCode === 204 ? null : Readable.toWeb(res) as ReadableStream<Uint8Array>, { status: res.statusCode, headers: new Headers(Object.entries(res.headers).flatMap(([k,v]) => v === undefined ? [] : [[k, Array.isArray(v) ? v.join(',') : v] as [string, string]])) })));
      req.on('error', reject); if (init.body) req.write(init.body); req.end();
    });
  };
  return { endpoint, ca, send, requests, calls: () => calls, drift: () => { drift = true; }, redirect: () => { redirect = true; }, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(dir, { recursive: true, force: true }); } };
}
