import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { appendFileSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { run } from './cli.ts';
import { fakeKeychain } from './fake-keychain.ts';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const yes = () => ({ action: 'accept', content: { yes: true } });
const weather = JSON.stringify({ openapi: '3.0.3', info: { title: 'weather', version: '1' }, servers: [{ url: 'https://weather.example' }],
  paths: { '/forecast': { get: { operationId: 'getForecast', security: [], responses: { 200: { description: 'ok' } } } } } });
const checked = (place: string) => ((got) => ({ code: got?.code ?? -1, said: [...(got?.out ?? []), ...(got?.err ?? [])].join('\n') }))(run('@lapxo/bound', place, ['fold', '--check']));

test('a place head founds is a point at birth: founded, and again after a source is connected, bound alone checks it closed — no head running, nothing but what the place holds; a pinned byte altered afterwards is refused', async () => {
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-born-'))];
  const env = { ...fakeKeychain({}).env, HEAD_HOME: home }, place = join(shared, 'mine');
  writeFileSync(join(shared, 'weather.json'), weather);
  await ask([tool('place', { dir: place })], [], env, yes);
  const born = checked(place);
  deepStrictEqual(born.code, 0, born.said); match(born.said, /^PASS +closed/m); match(born.said, /^RECEIPTS [1-9]\d* read · 0 opened/m);
  await ask([tool('connect', { place, source: 'weather', document: join(shared, 'weather.json') })], [shared], env, yes);
  const connected = checked(place);
  deepStrictEqual(connected.code, 0, connected.said); match(connected.said, /^PASS +closed/m);
  const [pin] = readdirSync(join(place, 'pins', 'weather'));
  appendFileSync(join(place, 'pins', 'weather', pin!), 'bound-lock/1 at=place:openapi form=alphabet measure=class role=writes scope=offers/weather/everything value=callable\n');
  const altered = checked(place);
  ok(altered.code !== 0, 'an altered pin is not checked closed'); match(altered.said, /REFUSE/);
});
