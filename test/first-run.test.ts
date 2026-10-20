import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { run } from './cli.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { lock, said, text } from './place.ts';
import { aboutOf, valueOf } from '../src/core/lock.ts';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const weather = JSON.stringify({ openapi: '3.0.3', info: { title: 'weather', version: '1' }, servers: [{ url: 'https://weather.example' }],
  paths: { '/forecast': { get: { operationId: 'getForecast', security: [], responses: { 200: { description: 'ok' } } } } } });

test('first run: a person connects a source by its address, naming no place and sharing no folder, and on one yes their place is founded under their own home and the source connected to it; asked again with no place, the one place head holds answers, never founded twice', async () => {
  const server = createServer((request, response) => { response.writeHead(request.url === '/weather.json' ? 200 : 404); response.end(request.url === '/weather.json' ? weather : ''); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const document = `http://127.0.0.1:${(server.address() as AddressInfo).port}/weather.json`, mine = mkdtempSync(join(tmpdir(), 'head-person-'));
  try {
  const env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine }, asked: string[] = [], titles: string[] = [];
  const yes = (params: any) => { asked.push(params.message); titles.push(params.requestedSchema?.properties?.yes?.title); return { action: 'accept', content: { yes: true } }; };
  const [first] = await ask([tool('connect', { source: 'weather', document })], [], env, yes);
  deepStrictEqual(titles, [aboutOf(lock, 'said/elicit/yes')], 'the yes a person ticks is titled by the words of its line, never by the line-s value');
  const place = join(mine, 'place');
  match(text(first), said('born')); deepStrictEqual(asked.length, 1, 'one yes founds the place and connects the source'); match(asked[0]!, said('elicit-first-run'));
  ok(existsSync(join(place, 'TARGET.bound')) && / scope=uses\/weather /.test(run('@lapxo/bound', place, ['fold', '--as', 'lines'])?.out.join('\n') ?? ''), 'the source is pinned in the person-s place');
  const [looked] = await ask([tool('look', { source: 'weather', at: '0' })], [], env, yes);
  match(text(looked), /offers\/weather\/getForecast/);
  const birth = readFileSync(join(place, valueOf(lock, 'founding/birth-file')), 'utf8').split('\n').filter(Boolean), standing = (run('@lapxo/bound', place, ['fold', '--as', 'lines'])?.out ?? []).filter((l) => l.startsWith('bound-lock/1'));
  deepStrictEqual(birth.filter((l) => !l.includes(` at=${valueOf(lock, 'founding/person-at')}`) || / (sig|epoch)=/.test(l)), [], 'the birth file holds the person-s lines alone, drafted with no signature');
  ok(['keys/root', 'keys/head', 'keys/person', 'lang', 'allow/reuse', 'uses/weather', 'allow/read'].every((s) => birth.some((l) => l.includes(` scope=${s} `))) && !birth.some((l) => / scope=(wire|view|transport|reader|reading-identity|signer)\//.test(l)), birth.join('\n'));
  ok(standing.some((l) => l.includes(' scope=wire/fields ')) && birth.length < standing.length, 'the profile stands in the place for bound to read; the person-s file never names it');
  asked.length = 0;
  const [again] = await ask([tool('connect', { source: 'tides', document })], [], env, yes);
  deepStrictEqual([asked.length, text(again).includes('born')], [1, false], 'the second source is connected to the same place, on its own yes; nothing is founded');
  match(asked[0]!, said('elicit-connect')); match(asked[0]!, new RegExp(place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally { server.closeAllConnections(); server.close(); }
});
