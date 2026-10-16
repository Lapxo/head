import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { said, text } from './place.ts';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const yes = (params: any) => (params.requestedSchema?.properties?.yes ? { action: 'accept', content: { yes: true } } : { action: 'accept', content: {} });
const sealed = (secret: string) => Buffer.from(JSON.stringify({ secret, at: '2026-01-01T00:00:00.000Z' })).toString('base64url');
const auth = JSON.stringify({ openapi: '3.0.3', info: { title: 'auth', version: '1' }, servers: [{ url: 'https://auth.example' }], paths: { '/login': { post: { operationId: 'login', security: [], responses: { 200: { description: 'ok' } } } } } });
const digest = `sha256:${createHash('sha256').update(auth).digest('hex')}`;

/** An origin answering by path — a body, a status, or a move to another address — and keeping each request it was sent. */
const serve = async (answer: (path: string) => { readonly status?: number; readonly body?: string; readonly location?: string }) => {
  const seen: { url: string; authorization: string }[] = [];
  const server = createServer((request, response) => { seen.push({ url: request.url ?? '', authorization: String(request.headers['authorization'] ?? '') }); const got = answer(request.url ?? ''); response.writeHead(got.status ?? 200, got.location ? { location: got.location } : {}).end(got.body ?? ''); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) };
};

/**
 * A place that connected a source behind a bearer, its token held in the keychain or not, beside an API that serves a
 * document only to that bearer and moves another to a second origin; each origin keeps the requests it was sent.
 */
const shop = async (held = true) => {
  const elsewhere = await serve((path) => (path === '/blob/auth.json' ? { body: auth } : { status: 404 }));
  const server = await serve((path) => (path === '/items' ? { body: '[]' } : path === '/private/moved.json' ? { status: 302, location: `${elsewhere.url}/blob/auth.json` } : path === '/private/auth.json' ? { body: auth } : { status: 404 }));
  const at = mkdtempSync(join(tmpdir(), 'head-fetch-')), dir = join(at, 'shop');
  const keychain = fakeKeychain(held ? { 'place/shop/api/store': sealed('tok') } : {}), env = { ...keychain.env, HEAD_HOME: join(at, 'home') };
  writeFileSync(join(at, 'store.json'), JSON.stringify({ openapi: '3.0.3', info: { title: 'store', version: '1' }, servers: [{ url: server.url }], security: [{ bearer: [] }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } }, paths: { '/items': { get: { operationId: 'listItems', responses: { 200: { description: 'ok' } } } } } }));
  await ask([tool('place', { dir })], [], env, yes);
  match(text((await ask([tool('connect', { place: dir, source: 'store', document: join(at, 'store.json') })], [at], env, yes))[0]), said('connected'));
  const connect = async (args: Record<string, string>) => text((await ask([tool('connect', { place: dir, source: 'auth', via: 'store', ...args })], [], env, yes))[0]);
  const pinned = () => / scope=uses\/auth /.test(readFileSync(join(dir, 'TARGET.bound'), 'utf8'));
  return { server, elsewhere, connect, pinned, close: async () => { await server.close(); await elsewhere.close(); } };
};
const sent = (origin: Awaited<ReturnType<typeof serve>>, path: string) => origin.seen.filter((one) => one.url === path).map((one) => one.authorization);

test('a document behind a source-s access is read as that source: its access goes to that source-s origin alone, and the bytes connect only when they hash to the digest named', async () => {
  const at = await shop();
  try {
    match(await at.connect({ document: `${at.server.url}/private/auth.json`, digest }), said('connected'));
    deepStrictEqual([sent(at.server, '/private/auth.json'), at.pinned()], [['Bearer tok'], true]);
  } finally { await at.close(); }
});

test('no: bytes that hash otherwise than the digest named are never connected', async () => {
  const at = await shop();
  try {
    match(await at.connect({ document: `${at.server.url}/private/auth.json`, digest: `sha256:${'0'.repeat(64)}` }), said('document-digest'));
    ok(!at.pinned());
  } finally { await at.close(); }
});

test('no: an address at another origin than the source-s is never sent its access — nothing is fetched', async () => {
  const at = await shop();
  try {
    match(await at.connect({ document: `${at.elsewhere.url}/blob/auth.json`, digest }), said('fetch-cross-origin'));
    deepStrictEqual([at.elsewhere.seen.length, at.pinned()], [0, false]);
  } finally { await at.close(); }
});

test('a move to another address is followed without the access, and only for bytes named by their digest', async () => {
  const at = await shop();
  try {
    const moved = `${at.server.url}/private/moved.json`;
    match(await at.connect({ document: moved }), said('fetch-redirect'));
    ok(!at.pinned() && at.elsewhere.seen.length === 0, 'without a digest the move is not followed');
    match(await at.connect({ document: moved, digest }), said('connected'));
    deepStrictEqual([sent(at.server, '/private/moved.json'), sent(at.elsewhere, '/blob/auth.json'), at.pinned()], [['Bearer tok', 'Bearer tok'], [''], true], 'the access went to its own origin; the address it moved to was asked without it');
  } finally { await at.close(); }
});

test('no: a source that holds no access yet is asked through its own flow, and a secret the place allows none of is never asked — nothing is fetched', async () => {
  const at = await shop(false);
  try {
    const said_ = await at.connect({ document: `${at.server.url}/private/auth.json`, digest });
    ok(!said('connected').test(said_), said_);
    deepStrictEqual([sent(at.server, '/private/auth.json'), at.pinned()], [[], false]);
  } finally { await at.close(); }
});
