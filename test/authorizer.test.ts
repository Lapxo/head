import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { answered, said, text, viewOf } from './place.ts';

const tool = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
type Seen = { method: string; path: string; query: URLSearchParams; headers: Record<string, unknown>; body: string };
/** A server on this device answering by a function of each request, every request kept. */
const serve = async (answer: (r: Seen, self: string) => { status?: number; body?: unknown; headers?: Record<string, string> }) => {
  const seen: Seen[] = [];
  let self = '';
  const server = createServer((request, response) => { let body = ''; request.on('data', (c) => { body += c; }); request.on('end', () => {
    const url = new URL(request.url ?? '/', self), one: Seen = { method: request.method ?? '', path: url.pathname, query: url.searchParams, headers: request.headers, body };
    seen.push(one); const got = answer(one, self); response.writeHead(got.status ?? 200, { 'content-type': 'application/json', ...(got.headers ?? {}) }); response.end(got.body === undefined ? '' : JSON.stringify(got.body)); }); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  self = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url: self, seen, close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) };
};
/** An authorization server that registers clients, takes S256 and refreshes: the code it hands is only redeemed by the verifier whose challenge it was sent. */
const authorizationServer = async () => {
  let challenge = '';
  return serve((r, self) => {
    if (r.path === '/.well-known/oauth-authorization-server') return { body: { issuer: self, authorization_endpoint: `${self}/authorize`, token_endpoint: `${self}/token`, registration_endpoint: `${self}/register`, code_challenge_methods_supported: ['S256'] } };
    if (r.path === '/register') return { status: 201, body: { client_id: 'c-1' } };
    if (r.path === '/authorize') { challenge = r.query.get('code_challenge') ?? ''; return { status: 302, headers: { location: `${r.query.get('redirect_uri')}?code=k-1&state=${r.query.get('state')}` } }; }
    const form = new URLSearchParams(r.body);
    if (r.path === '/token' && form.get('grant_type') === 'authorization_code' && form.get('code') === 'k-1' && createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') === challenge && form.get('client_id') === 'c-1')
      return { body: { access_token: 'at-1', token_type: 'Bearer', expires_in: 0, refresh_token: 'rt-1' } };
    if (r.path === '/token' && form.get('grant_type') === 'refresh_token' && form.get('refresh_token') === 'rt-1' && form.get('client_id') === 'c-1') return { body: { access_token: 'at-2', token_type: 'Bearer', expires_in: 3600, refresh_token: 'rt-2' } };
    return { status: 400, body: { error: 'invalid_request' } };
  });
};
/** A resource that says nothing in its document of how access is proven, and refuses a request without its bearer naming its metadata. */
const resourceServer = (as: string, resource?: string) => serve((r, self) => (r.path === '/.well-known/oauth-protected-resource' ? { body: { resource: resource ?? self, authorization_servers: [as], scopes_supported: ['items:read'] } }
  : ['Bearer at-1', 'Bearer at-2'].includes(String(r.headers['authorization'] ?? '')) ? { body: { id: 1 } } : { status: 401, body: { error: 'unauthorized' }, headers: { 'www-authenticate': `Bearer resource_metadata="${self}/.well-known/oauth-protected-resource"` } }));
const silent = (server: string) => JSON.stringify({ openapi: '3.0.3', info: { title: 'items', version: '1' }, servers: [{ url: server }],
  paths: { '/items': { get: { operationId: 'listItems', responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } } } } } } });
/** A place of one silent source, and a person whose browser opens what head offers, following where it moves. */
const placed = async (rs: string) => {
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-authorizer-'))];
  const env = { ...fakeKeychain({}).env, HEAD_HOME: home }, place = join(shared, 'items'), visits: string[] = [];
  const person = async (params: any) => { if (params.mode === 'url') { visits.push(params.url); await fetch(params.url); return { action: 'accept' }; } return { action: 'accept', content: { yes: true } }; };
  writeFileSync(join(shared, 'items.json'), silent(rs));
  await ask([tool('place', { dir: place })], [], env, person);
  await ask([tool('connect', { place, source: 'items', document: join(shared, 'items.json') })], [shared], env, person);
  return { place, env, person, visits, read: () => ask([tool('look', { place, source: 'items', operation: 'listItems', at: '8' })], [], env, person).then(([one]) => text(one)) };
};

test('a resource that refuses with its metadata names its authorizer: head observes the oauth2 code flow from RFC 9728 and RFC 8414, registers a client only as the server offers (RFC 7591), signs in once through its page with PKCE, keeps token and refresh in the keychain and renews on the next use — no overlay', async () => {
  const as = await authorizationServer(), rs = await resourceServer(as.url);
  try {
    const at = await placed(rs.url);
    const first = await at.read();
    match(first, answered('listItems', 401)); match(first, said('authorizer-observed'));
    const evidence = viewOf(at.place, 'evidence');
    ok(evidence.split('\n').some((l) => / by=head .*scope=access\/items\/authorizer\/steps\/1 .*value=http:\/\/127\.0\.0\.1:\d+\/authorize$/.test(l.replace(/ sig="[^"]*"/, ''))), 'the flow, observed under head-s key');
    const second = await at.read();
    match(second, answered('listItems', 200)); deepStrictEqual(at.visits.length, 1, 'signed in once, on head-s page');
    const third = await at.read();
    match(third, answered('listItems', 200)); deepStrictEqual(at.visits.length, 1, 'renewed with nothing asked');
    deepStrictEqual(rs.seen.filter((r) => r.path === '/items').map((r) => r.headers['authorization'] ?? ''), ['', 'Bearer at-1', 'Bearer at-2']);
    const [register, authorize] = [as.seen.find((r) => r.path === '/register')!, as.seen.find((r) => r.path === '/authorize')!];
    deepStrictEqual([JSON.parse(register.body).redirect_uris.length, JSON.parse(register.body).token_endpoint_auth_method, authorize.query.get('code_challenge_method'), authorize.query.get('client_id'), authorize.query.get('resource'), authorize.query.get('scope')],
      [1, 'none', 'S256', 'c-1', rs.url, 'items:read']);
    deepStrictEqual(as.seen.filter((r) => r.path === '/token').map((r) => new URLSearchParams(r.body).get('grant_type')), ['authorization_code', 'refresh_token']);
    for (const r of [...as.seen, ...rs.seen]) ok(!/at-1|at-2|rt-/.test(r.path + r.query.toString()), 'no token rides an address');
    ok(/ scope=access\/items\/authorizer\/obtained /.test(viewOf(at.place, 'evidence')) && / scope=access\/items\/authorizer\/renewed /.test(viewOf(at.place, 'evidence')), 'obtained, then renewed, each a receipt without the secret');
  } finally { await as.close(); await rs.close(); }
});

test('no: metadata that names another resource than the one that refused is no authorizer — nothing observed, nothing registered, no page offered', async () => {
  const as = await authorizationServer(), rs = await resourceServer(as.url, 'https://elsewhere.example');
  try {
    const at = await placed(rs.url);
    const [first, second] = [await at.read(), await at.read()];
    for (const one of [first, second]) match(one, answered('listItems', 401));
    deepStrictEqual([/ scope=access\/items\/authorizer/.test(viewOf(at.place, 'evidence')), as.seen.length, at.visits.length], [false, 0, 0]);
  } finally { await as.close(); await rs.close(); }
});
