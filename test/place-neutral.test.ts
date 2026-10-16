import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { declaredOf, under } from '../src/core/lock.ts';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const yes = () => ({ action: 'accept', content: { yes: true } });
const weather = JSON.stringify({ openapi: '3.0.3', info: { title: 'weather', version: '1' }, servers: [{ url: 'https://weather.example' }],
  paths: { '/forecast': { get: { operationId: 'getForecast', security: [], responses: { 200: { description: 'ok' } } } } } });

test('a place is the person-s, named for what it holds and never for head: what head compiles and the walk context it lays sit in the place-s own folders, nothing under a folder named for head', async () => {
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-neutral-'))];
  const env = { ...fakeKeychain({}).env, HEAD_HOME: home }, place = join(shared, 'mine');
  writeFileSync(join(shared, 'weather.json'), weather);
  await ask([tool('place', { dir: place })], [], env, yes);
  await ask([tool('connect', { place, source: 'weather', document: join(shared, 'weather.json') })], [shared], env, yes);
  const lock = readFileSync(join(place, 'TARGET.bound'), 'utf8');
  ok(!existsSync(join(place, '.head')), 'no folder named for head in the place');
  ok(/ needs=pins\/weather\/[0-9a-f]{16}\.bound /.test(lock), 'the pin needs the place-s own folder');
  ok(existsSync(join(place, 'walk', 'context.bound')) && lock.split('\n').some((l) => l.includes(' scope=walk/context ') && l.includes(' needs=walk/context.bound ')), 'the walk context beside the lock, in the place-s own folder');
});

test('the folders a place-s pins are read under: the place-s own first, where head lays a compile, and the one a head before 0.1.2 laid them in, still read', () => {
  const lock = declaredOf(readFileSync('TARGET.bound', 'utf8'));
  deepStrictEqual([under(lock, 'place/compiled', 'pins/weather/0123456789abcdef.bound'), under(lock, 'place/compiled', '.head/compiled/weather/0123456789abcdef.bound'), under(lock, 'place/compiled', 'connected/weather.json')], [true, true, false]);
});
