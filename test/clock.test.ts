import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { kept, overlay } from './kept.ts';
import { said, text } from './place.ts';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const spec = JSON.stringify({ openapi: '3.0.3', info: { title: 'things', version: '1' }, servers: [{ url: 'https://things.example' }],
  paths: { '/things': { get: { operationId: 'listThings', security: [], responses: { 200: { description: 'ok' } } } } } });

const yes = (params: any) => (params.requestedSchema?.properties?.yes ? { action: 'accept', content: { yes: true } } : { action: 'accept', content: {} });
const founded = async () => {
  const shared = mkdtempSync(join(tmpdir(), 'head-clock-'));
  const env = { ...fakeKeychain({}).env, HEAD_HOME: join(shared, 'home') };
  writeFileSync(join(shared, 'things.json'), spec);
  await ask([tool('place', { dir: join(shared, 'shop') })], [], env, yes);
  return { shared, env, dir: join(shared, 'shop') };
};

test('a time ceiling measures head-s work, never the person-s: a yes that took eleven seconds to come puts no red on a connect whose ceiling is ten', async () => {
  const warm = await kept([spec], async () => ((at) => ask([tool('connect', { place: at.dir, source: 'things', document: join(at.shared, 'things.json') })], [at.shared], at.env, yes).then(() => at.dir))(await founded()));
  const { shared, env, dir } = await founded();
  overlay(dir, warm);
  const t = Date.now();
  const [connected] = await ask([tool('connect', { place: dir, source: 'things', document: join(shared, 'things.json') })], [shared], env,
    async (params: any) => { await new Promise((done) => setTimeout(done, 11_000)); return yes(params); });
  ok(Date.now() - t >= 11_000);
  match(text(connected), said('connected'));
  deepStrictEqual(text(connected).split('\n').filter((l) => l.startsWith('red:')), [], 'the person-s eleven seconds are theirs, not head-s');
});
