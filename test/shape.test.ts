import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { declaredOf, members, valueOf } from '../src/core/lock.ts';
import { sayIn } from '../src/core/surface.ts';
import { cellOf, shapeOf } from '../src/ports/surface.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';

const lock = declaredOf(readFileSync('TARGET.bound', 'utf8')), states = members(valueOf(lock, 'shape/states'));
const codes = lock.filter((l) => /^said\/[a-z0-9/-]+$/.test(l.scope ?? '') && !/\/(state|next)(\/args)?$/.test(l.scope!)).map((l) => ({ code: l.scope!.slice('said/'.length), about: l.about ?? '' }));
const asked = new Set(codes.filter((c) => valueOf(lock, `said/${c.code}/state`) === 'asked').map((c) => c.code));
/** The longest fixed run of a code's lock words: present in an answer, head said a sentence. */
const words = (about: string) => about.split(/\{\w+\}/).map((p) => p.trim()).sort((a, b) => b.length - a.length)[0] ?? '';

test('every said code has a state from the lock-s alphabet and a next — a tool with arguments read from its own cell, or none with why; a reference to a field the cell does not carry is none of them', () => {
  for (const { code, about } of codes) {
    ok(states.includes(valueOf(lock, `said/${code}/state`)), `said/${code} has no state of ${states.join('|')}`);
    const next = valueOf(lock, `said/${code}/next`), held = new Set([...about.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    ok(next !== '', `said/${code} has no next`);
    for (const arg of members(valueOf(lock, `said/${code}/next/args`))) { const v = arg.slice(arg.indexOf(':') + 1); ok(!v.startsWith('$') || held.has(v.slice(1)), `said/${code}/next names ${v}, a field its cell does not carry`); }
  }
});

test('a cell-s next carries the real arguments from its fields; a bound refusal keeps bound-s code with head-s beside it; a red is the state of the cell it measured, beside a done one in the same answer', () => {
  deepStrictEqual(cellOf(lock, 'not-covered', { place: '/p', coverage: 'read/**', scope: 'act/x' }).next, { tool: 'ask', args: { place: '/p', lines: '' } }, 'lines the person signs are asked with lines, which the model drafts');
  deepStrictEqual(cellOf(lock, 'is-read', { source: 'weather', operation: 'getForecast' }).next, { tool: 'ask', args: { source: 'weather', operation: 'getForecast' } }, 'a read is asked with no resolution');
  const refused = cellOf(lock, 'unfolded', { place: '/p', why: 'REFUSE·check receipts are open; a fold must close them' });
  deepStrictEqual([refused.code, refused.head, refused.state], ['REFUSE·check', 'head/unfolded', 'refused']);
  const say = sayIn(lock), answer = shapeOf([say('answered', { source: 'w', operation: 'o', status: '200' }), say('red', { coordinate: 'answer/w/o@8', seconds: '3', scope: 'answer/seconds', ceiling: '0..2' }), 'bound-lock/1 a line']);
  deepStrictEqual([answer.cells.map((c) => c.state), answer.lines], [['done', 'red'], ['bound-lock/1 a line']]);
  deepStrictEqual(shapeOf([say('answered', { source: 'w', operation: 'o', status: '200' })]).cells[0]!.fields, { source: 'w', operation: 'o', status: '200' }, 'read back, the fields it was said with');
});

test('no result without state and next: a place founded, a source connected and read, a refusal on the way — every tool result is the one shape, structured beside its text, and no sentence of head-s lock words is in any answer', async () => {
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-shape-'))], env = { ...fakeKeychain({}).env, HEAD_HOME: home }, place = join(shared, 'mine');
  writeFileSync(join(shared, 'weather.json'), JSON.stringify({ openapi: '3.0.3', info: { title: 'w', version: '1' }, servers: [{ url: 'https://weather.example' }], paths: { '/forecast': { get: { operationId: 'getForecast', security: [], responses: { 200: { description: 'ok' } } } } } }));
  const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } }), yes = () => ({ action: 'accept', content: { yes: true } });
  const [listed] = await ask([{ method: 'tools/list' }]);
  ok(listed.result.tools.every((t: any) => t.outputSchema?.required?.includes('cells')), 'every tool declares the one output schema');
  const answers = [...await ask([tool('place', { dir: place })], [], env, yes), ...await ask([tool('connect', { place, source: 'weather', document: join(shared, 'weather.json') })], [shared], env, yes),
    ...await ask([tool('look', { place, source: 'weather', at: '0' }), tool('look', { place, source: 'weather', operation: 'nothing', at: '8' }), tool('look', { place, source: 'weather', operation: 'getForecast', why: 'true' })], [], env, yes)];
  for (const a of answers) {
    const shape = a.result.structuredContent, text = a.result.content[0].text as string;
    ok(Array.isArray(shape?.cells) && Array.isArray(shape?.lines), `a result without the shape: ${text.slice(0, 120)}`);
    for (const c of shape.cells) ok(states.includes(c.state) && ('tool' in c.next || 'none' in c.next) && typeof c.code === 'string', `a cell without state or next: ${JSON.stringify(c)}`);
    for (const { code, about } of codes.filter((c) => !asked.has(c.code) && words(c.about).length >= 24)) ok(!text.includes(words(about)), `said/${code} said in its lock words: ${words(about)}`);
  }
  ok(answers.some((a) => a.result.structuredContent.cells.some((c: any) => c.code === 'head/unknown-operation' && c.state === 'refused' && c.next.tool === 'ask' && c.next.args.source === 'weather' && c.next.args.why === 'true')), `the refusal on the way, with its next: ${JSON.stringify(answers.map((a) => a.result.structuredContent.cells.map((c: any) => c.code)))}`);
});
