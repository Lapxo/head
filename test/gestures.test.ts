import { test } from 'node:test';
import { deepStrictEqual, match } from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { api, said, text, viewOf } from './place.ts';

const tool = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
const ok = { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } } };
const weather = (server: string) => JSON.stringify({ openapi: '3.0.3', info: { title: 'weather', version: '1' }, servers: [{ url: server }],
  paths: { '/forecast': { get: { operationId: 'getForecast', security: [], responses: ok } }, '/alerts': { get: { operationId: 'getAlerts', security: [], responses: ok } } } });
/** A place founded as a person founds one — its birth lines head-s own — one source connected, and every prompt and every request counted. */
const founded = async (answer: (url: string) => string | readonly [number, string]) => {
  const server = await api(answer), [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-gestures-'))];
  const env = { ...fakeKeychain({}).env, HEAD_HOME: home }, place = join(shared, 'weather'), asked: string[] = [];
  const person = (params: any) => { asked.push(params.message); return { action: 'accept', content: { yes: true } }; };
  writeFileSync(join(shared, 'weather.json'), weather(server.url));
  await ask([tool('place', { dir: place })], [], env, person);
  await ask([tool('connect', { place, source: 'weather', document: join(shared, 'weather.json') })], [shared], env, person);
  asked.length = 0;
  const look = (operation: string, more: Record<string, unknown> = {}) => ask([tool('look', { place, source: 'weather', operation, at: '8', ...more })], [], env, person).then(([one]) => text(one));
  return { server, place, env, asked, look };
};

test('never ask twice: a place is born letting a kept answer stand in as long as its read grant lasts — the same question twice is one yes, one call, and a kept answer; a refusal never stands in; a person-s own line for a source narrows it', async () => {
  const at = await founded((url) => (url.startsWith('/alerts') ? [401, '{"error":"no"}'] : '{"id":1}'));
  try {
    match(readFileSync(join(at.place, 'TARGET.bound'), 'utf8'), / form=interval measure=seconds role=writes scope=allow\/reuse .*value=0\.\.7776000/);
    const [first, second] = [await at.look('getForecast'), await at.look('getForecast')];
    match(first, /answered 200 to getForecast/); match(second, said('reused'));
    deepStrictEqual([at.server.seen.filter((r) => r.url === '/forecast').length, at.asked.length], [1, 1], 'one call, one yes');
    const [refused, again] = [await at.look('getAlerts'), await at.look('getAlerts')];
    for (const one of [refused, again]) match(one, /answered 401 to getAlerts/);
    deepStrictEqual(at.server.seen.filter((r) => r.url === '/alerts').length, 2, 'a refusal is never kept as an answer');
    const [lot] = await ask([tool('plan', { place: at.place, lines: 'bound-lock/1 at=policy:person/reuse by=target form=interval measure=seconds role=writes scope=allow/reuse/weather value=0..0' })], [], at.env, () => ({ action: 'accept', content: { yes: true } }));
    await ask([tool('land', { lot: /Lot (sha256:[0-9a-f]+)/.exec(text(lot))?.[1] ?? '' })], [], at.env);
    match(viewOf(at.place, 'lines'), / scope=allow\/reuse\/weather .*value=0\.\.0/);
    match(await at.look('getForecast'), /answered 200 to getForecast/);
    deepStrictEqual(at.server.seen.filter((r) => r.url === '/forecast').length, 2, 'the person-s own line for the source stands over the place-s');
  } finally { await at.server.close(); }
});

test('why: the newest answer of a request says who said it and when, its receipt digest and the pins it rests on, read off the place-s evidence and lines, nothing called; a request with no answer says there is no line', async () => {
  const at = await founded(() => '{"id":1}');
  try {
    match(await at.look('getForecast', { why: 'true' }), said('why-none'));
    await at.look('getForecast');
    const calls = at.server.seen.length, why = await at.look('getForecast', { why: 'true' });
    match(why, said('why'));
    const receipt = viewOf(at.place, 'evidence').split('\n').find((l) => / scope=read\/weather\/getForecast\//.test(l) && / measure=digest /.test(l))!, pin = viewOf(at.place, 'lines').split('\n').find((l) => / scope=uses\/weather /.test(l))!;
    for (const part of [/ value=(sha256:\S+)$/.exec(receipt)![1]!, / by=(\S+)/.exec(receipt)![1]!, / value=(sha256:\S+)/.exec(pin)![1]!, 'topos-openapi sha256:']) match(why, new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    deepStrictEqual(at.server.seen.length, calls, 'why calls nothing');
  } finally { await at.server.close(); }
});
