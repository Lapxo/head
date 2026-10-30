import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { members, valueOf } from '../src/core/lock.ts';
import { cellOf } from '../src/ports/surface.ts';
import { ask } from './client.ts';
import { api, born, lock, root } from './place.ts';

const [measured, structural, reported, whyOnly] = ['measured', 'structural', 'reported', 'structural/why'].map((k) => members(valueOf(lock, `numbers/${k}`)));
const abouts = lock.filter((l) => /^said\/[a-z0-9-]+$/.test(l.scope ?? '')).map((l) => ({ code: l.scope!.slice('said/'.length), held: new Set([...(l.about ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)) }));
const sources = (dir: string): readonly string[] => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : []));
/** The fields a cell is given a number in, as code says it: String(…) or Number(…) of something, a length, a fixed count. */
const numbered = (text: string): readonly string[] => [...text.matchAll(/\(\s*'([a-z0-9-]+)',\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)]
  .flatMap((m) => [...m[2]!.matchAll(/(\w+):\s*(?:String\(|Number\(|Math\.|[\w.]+\.length\b|[\w.()]+\.toFixed\()/g)].map((f) => `${m[1]}.${f[1]}`));
const unkinded = (text: string) => numbered(text).filter((f) => ![...measured, ...structural, ...reported].includes(f.split('.')[1]!));
const cells = (answer: any): any[] => answer.result.structuredContent.cells;
const reading = (place: string) => ({ method: 'tools/call', params: { name: 'ask', arguments: { place, source: 'tracker', operation: 'issues/list-for-repo', args: { owner: 'lapxo', repo: 'demo' } } } });

test('numbers: every number code gives a cell is measured, structural or reported; a measured one names its model and params, a reported one who said it and when, and a ledger epoch is said only where why is asked', () => {
  deepStrictEqual(sources('src').flatMap((f) => unkinded(readFileSync(join(root, f), 'utf8'))), [], 'a number of no kind');
  deepStrictEqual([...measured, ...structural, ...reported].filter((f) => !abouts.some((a) => a.held.has(f))), [], 'a kind for a field no cell carries');
  deepStrictEqual(measured.filter((f) => !valueOf(lock, `numbers/${f}/model`) || !valueOf(lock, `numbers/${f}/params`)), [], 'a measured number without its model or params');
  deepStrictEqual(abouts.filter((a) => reported.some((f) => a.held.has(f)) && !(a.held.has('at') && (a.held.has('source') || a.held.has('document')))).map((a) => a.code), [], 'a reported number without who said it and when');
  deepStrictEqual(abouts.filter((a) => a.code !== 'why' && whyOnly.some((f) => a.held.has(f))).map((a) => a.code), [], 'a ledger epoch outside why');
});

test('no: a number code gives a cell with no kind is named, and a value nothing measured is said unmeasured with what it waits on, with no digit for it', () => {
  deepStrictEqual(unkinded("say('slow', { source, took: String(spent.length) })"), ['slow.took']);
  const cell = cellOf(lock, 'unmeasured', { what: 'the loss between two sources', needs: 'a world that measures it' });
  deepStrictEqual([cell.state, 'none' in cell.next, Object.values(cell.fields).some((v) => /\d/.test(String(v)))], ['open', true, false]);
});

test('yes, over two places: status names its source and time; latency reds report the unchanged ceiling', async (t) => {
  const quick = await api(() => '{}'), late = createServer((_q, r) => { setTimeout(() => { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{}'); }, (Number(valueOf(lock, 'answer/seconds').split('..')[1]) + 1) * 1000); });
  await new Promise<void>((done) => late.listen(0, '127.0.0.1', done));
  const [a, b] = [born(`http://127.0.0.1:${(late.address() as AddressInfo).port}`), born(quick.url)];
  const [read, other] = [(await ask([reading(a.place)], [], a.keychain.env))[0], (await ask([reading(b.place)], [], b.keychain.env))[0]];
  late.closeAllConnections(); late.close(); await quick.close();
  const seen = (answer: any) => cells(answer).filter((c) => ['head/answered', 'head/untyped', 'head/red'].includes(c.code)).map((c) => [c.code, Object.keys(c.fields).sort().join(',')]);
  deepStrictEqual([seen(read), seen(other)].map((answer) => answer.filter(([code]) => code !== 'head/red')), [[['head/untyped', 'at,operation,source,status,why']], [['head/untyped', 'at,operation,source,status,why']]]);
  for (const answer of [read, other]) for (const red of cells(answer).filter((c) => c.code === 'head/red')) {
    deepStrictEqual(Object.keys(red.fields).sort(), ['ceiling', 'coordinate', 'scope', 'seconds']);
    deepStrictEqual([red.fields.scope, red.fields.ceiling], ['answer/seconds', valueOf(lock, 'answer/seconds')]);
    ok(Number(red.fields.seconds) > Number(red.fields.ceiling.split('..')[1]));
  }
  t.diagnostic(`MEASURED answer latency reds: delayed ${cells(read).filter((c) => c.code === 'head/red').map((c) => c.fields.seconds)} s; immediate ${cells(other).filter((c) => c.code === 'head/red').map((c) => c.fields.seconds).join(', ') || 'within ceiling'}`);
  const [answered, red] = [cells(read).find((c) => c.code === 'head/untyped'), cells(read).find((c) => c.code === 'head/red')];
  ok(answered.fields.status === '200' && !Number.isNaN(Date.parse(answered.fields.at)) && Number(red.fields.seconds) > Number(valueOf(lock, 'answer/seconds').split('..')[1]), JSON.stringify([answered.fields, red.fields]));
});
