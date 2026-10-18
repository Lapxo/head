import { test } from 'node:test';
import { deepStrictEqual, match } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { answered, api, said, text, viewOf } from './place.ts';

const tool = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
const ok = { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } } };
/** A document that says nothing of how access is proven: no security anywhere, one read and one write. */
const silent = (server: string) => JSON.stringify({ openapi: '3.0.3', info: { title: 'silent', version: '1' }, servers: [{ url: server }],
  paths: { '/items': { get: { operationId: 'listItems', responses: ok }, post: { operationId: 'addItem', responses: ok } }, '/locked': { get: { operationId: 'listLocked', responses: ok } } } });

test('an unstated read is probed once with nothing attached: answered, it lands as observed under head-s key and is read anonymously from then on; refused, nothing is observed and it is probed again; a write whose access is unstated is never called', async () => {
  const server = await api((url) => (url === '/locked' ? [401, '{"error":"unauthorized"}'] : '{"id":1}'));
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-observed-'))];
  const env = { ...fakeKeychain({}).env, HEAD_HOME: home }, place = join(shared, 'silent'), yes = () => ({ action: 'accept', content: { yes: true } });
  const read = (operation: string) => tool('look', { place, source: 'silent', operation, at: '8' });
  const observed = () => viewOf(place, 'evidence').split('\n').filter((l) => / scope=access\/silent\/\S+\/observed /.test(l));
  try {
    writeFileSync(join(shared, 'silent.json'), silent(server.url));
    await ask([tool('place', { dir: place })], [], env, yes);
    await ask([tool('connect', { place, source: 'silent', document: join(shared, 'silent.json') })], [shared], env, yes);
    const [first] = await ask([read('listItems')], [], env, yes);
    match(text(first), answered('listItems', 200));
    deepStrictEqual(observed().map((l) => [/ by=(\S+)/.exec(l)![1], / value=(\S+)$/.exec(l)![1]]).length, 1, 'observed once');
    match(observed()[0]!, / at=receipt:\S+ .*scope=access\/silent\/listItems\/observed .*value=anonymous$/);
    const [second] = await ask([read('listItems')], [], env, yes);
    match(text(second), answered('listItems', 200)); deepStrictEqual(observed().length, 1, 'read anonymously, never observed again');
    const [locked, again] = await ask([read('listLocked'), read('listLocked')], [], env, yes);
    for (const one of [locked, again]) match(text(one), answered('listLocked', 401));
    deepStrictEqual([observed().length, server.seen.filter((r) => r.url === '/locked').length], [1, 2], 'refused, nothing observed; probed again');
    const [wrote] = await ask([tool('act', { place, source: 'silent', operation: 'addItem' })], [], env, yes);
    match(text(wrote), said('access-unstated')); deepStrictEqual(server.seen.filter((r) => r.method === 'POST').length, 0);
    match(text(wrote), / method="post" path="\/[^"]*"/, 'the refusal names the operation an overlay would state the access of');
  } finally { await server.close(); }
});
