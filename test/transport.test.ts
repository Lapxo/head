import { test } from 'node:test';
import { deepStrictEqual, match } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { prepare } from '../src/ports/adapters/request.ts';
import type { Call } from '../src/core/read.ts';
import { ask } from './client.ts';
import { born, said, text } from './place.ts';

const look = (place: string, repo: string) => ({ method: 'tools/call', params: { name: 'look', arguments: { place, source: 'tracker', operation: 'issues/list-for-repo', args: { owner: 'lapxo', repo }, at: '8' } } });
const listening = async (handle: Parameters<typeof createServer>[1], idle = 5000) => {
  const sockets = new Set<string>();
  const server = createServer(handle);
  server.keepAliveTimeout = idle;
  server.on('connection', (socket) => sockets.add(`${socket.remotePort}`));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, sockets, close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) };
};

test('no: a request that stalls is stopped when its wait runs out — nothing it sent back is read, and its connection is released', async () => {
  const server = await listening((_request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.write('[{"partial":'); });
  try {
    const call = { kind: 'call', source: 's', operation: 'o', origin: server.url, carry: { method: ['get'], path: ['/slow'] }, form: {}, classes: [], access: {} } as unknown as Call;
    const prepared = prepare(call, {}, [{ scope: 'adapter/request/wait', value: '0..300' }]);
    if (!('send' in prepared)) throw Error('not prepared');
    const started = Date.now();
    const got = await prepared.send(undefined, 1000);
    deepStrictEqual([got.kind, Date.now() - started < 3000], ['failed', true]);
  } finally { await server.close(); }
});

test('a server that closes idle connections between two reads fails neither: head pools them and waits on bound without blocking, so a closed one is never reused', async () => {
  const server = await listening((_request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end('[]'); }, 50);
  try {
    const { place, keychain } = born(server.url);
    const [first, second] = await ask([look(place, 'one'), look(place, 'two')], [], keychain.env);
    match(text(first), said('untyped')); match(text(second), said('untyped'));
    deepStrictEqual(server.sockets.size, 2, 'the first connection was closed by the server while bound landed, and the second read opened its own');
  } finally { await server.close(); }
});

test('no: a request carrying a secret is never redirected — a bearer sent to an origin that answers elsewhere stays with that origin, and the other is never reached', async () => {
  const elsewhere = await listening((_request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end('[]'); });
  const origin = await listening((_request, response) => { response.writeHead(302, { location: `${elsewhere.url}/taken` }); response.end(); });
  try {
    const call = { kind: 'call', source: 's', operation: 'o', origin: origin.url, carry: { method: ['get'], path: ['/things'] }, form: {}, classes: [], access: {} } as unknown as Call;
    const prepared = prepare(call, {}, [{ scope: 'adapter/request/wait', value: '0..3000' }]);
    if (!('send' in prepared)) throw Error('not prepared');
    const got = await prepared.send({ headers: { authorization: 'Bearer secret' }, query: {} }, 1000);
    deepStrictEqual([got.kind, got.kind === 'got' ? got.status : 0, elsewhere.sockets.size], ['got', 302, 0]);
  } finally { await origin.close(); await elsewhere.close(); }
});
