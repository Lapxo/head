import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deviceOf } from '../src/core/device.ts';
import { members, valueOf } from '../src/core/lock.ts';
import { fill } from '../src/core/surface.ts';
import { registryFor } from '../src/ports/signers.ts';
import { run } from './cli.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { line, lock } from './place.ts';

const call = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
const cells = (answer: any): any[] => answer.result.structuredContent.cells.filter((c: any) => !['head/card', 'head/red'].includes(c.code));
const [own, other] = members(valueOf(lock, 'marks/mark'));
const forecast = (origin: string) => JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: origin }], paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }],
  responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { temperature: { type: 'number' }, sky: { type: 'string' } } } } } } } } } } });
/** An API of its own that types its answer: what it answers, as the test says. */
const api = async (body: () => string) => {
  const server = createServer((request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(request.url === '/openapi.json' ? forecast(origin) : body()); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { document: `${origin}/openapi.json`, close: () => server.close() };
};
/** A person whose place connects two sources, each from the address given; asking them one question at once. */
const person = async (a: string, b: string) => {
  const mine = mkdtempSync(join(tmpdir(), 'head-marks-')), env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine }, yes = () => ({ action: 'accept', content: { yes: true } });
  const place = join(mine, valueOf(lock, 'first-run/folder')), question = { operation: 'get-forecast', args: { city: 'lima' } };
  await ask([call('connect', { source: 'forecast', ...question, document: a }), call('connect', { place, source: 'mirror', document: b })], [], env, yes);
  const rooted = (lines: readonly string[]) => {
    const lot = join(mkdtempSync(join(tmpdir(), 'head-marks-lot-')), 'lot.bound');
    writeFileSync(lot, `${lines.join('\n')}\n`);
    const [account, key, signer] = [fill(valueOf(lock, 'founding/root-account'), { place: 'place' }), valueOf(lock, 'founding/root').split('/')[1]!, deviceOf(lock).signer];
    const landed = run('@lapxo/bound', place, ['land', lot, '--key', key, '--signer', signer], { ...env, BOUND_SIGNERS: registryFor(signer, `${deviceOf(lock).service}/head`, account, key, valueOf(lock, 'founding/algorithm'), valueOf(lock, `platform/${process.platform}/store`)) });
    deepStrictEqual(landed?.code, 0, [...(landed?.out ?? []), ...(landed?.err ?? [])].join('\n'));
  };
  const receipts = (): ReadonlySet<string> => new Set((run('@lapxo/bound', place, ['fold', '--as', 'evidence'], env)?.out ?? []).filter((l) => l.includes(` scope=${valueOf(lock, 'receipt/family')}/`) && l.includes(' measure=digest ')).map((l) => / value=(sha256:[0-9a-f]{64})/.exec(l)?.[1] ?? ''));
  return { rooted, receipts, asked: async (sources = 'forecast|mirror') => cells((await ask([call('ask', { place, sources, ...question })], [], env, yes))[0]) };
};
const shares = (source: string, value: string) => line(`${valueOf(lock, 'marks/shares')}/${source}`, 'id', value, { at: 'policy:person/lineage' });
/** Every mark an answer carries rests on the receipt of a read: as many receipts as marks, each a digest. */
const unevidenced = (got: readonly any[]): number => got.filter((c) => c.code.startsWith('head/agreed')).reduce((n, c) => n + Math.max(0, [...c.fields.marks].length - c.fields.receipts.split('|').filter((r: string) => /^sha256:[0-9a-f]{64}$/.test(r)).length), 0);

test('yes, over two places: two sources of their own that agree are marked by both, each mark resting on its read; nobody declared their lineage, so head does not know whether they are independent', async () => {
  for (const _ of [1, 2]) {
    const [a, b] = [await api(() => '{"temperature":21,"sky":"clear"}'), await api(() => '{"temperature":21,"sky":"clear"}')];
    try {
      const p = await person(a.document, b.document), got = await p.asked(), again = await p.asked(), read = p.receipts();
      for (const answer of [got, again]) deepStrictEqual(answer.map((c) => [c.code, c.fields.field, c.fields.value, c.fields.marks]).sort(), [['head/agreed-unknown', 'sky', 'clear', own + own], ['head/agreed-unknown', 'temperature', '21', own + own]]);
      deepStrictEqual(unevidenced(got), 0);
      deepStrictEqual([...got, ...again].flatMap((c) => c.fields.receipts.split('|')).filter((r: string) => !read.has(r)), [], 'each mark cites the receipt of a read the place holds, never the digest of what was kept, also when a new conversation is answered from it');
      ok(unevidenced(got) <= Number(valueOf(lock, 'marks-without-evidence').split('..')[1]));
    } finally { a.close(); b.close(); }
  }
});

test('no: two sources that differ are both shown, each with its value and hour, and the loss between them is not measured; none is picked, and what they agree on is still marked', async () => {
  const [a, b] = [await api(() => '{"temperature":21,"sky":"clear"}'), await api(() => '{"temperature":25,"sky":"clear"}')];
  try {
    const got = await (await person(a.document, b.document)).asked();
    deepStrictEqual(got.filter((c) => c.code === 'head/forked').map((c) => [c.fields.field, c.fields.source, c.fields.value]).sort(), [['temperature', 'forecast', '21'], ['temperature', 'mirror', '25']]);
    ok(got.filter((c) => c.code === 'head/forked').every((c) => !Number.isNaN(Date.parse(c.fields.at))) && got.some((c) => c.code === 'head/unmeasured' && c.fields.needs === valueOf(lock, 'marks/loss-needs')));
    ok(!got.some((c) => c.code.startsWith('head/agreed') && c.fields.field === 'temperature') && got.some((c) => c.code === 'head/agreed-unknown' && c.fields.field === 'sky'), JSON.stringify(got.map((c) => c.code)));
  } finally { a.close(); b.close(); }
});

test('lineage, as the place declares it and no further: a source declared to share the other-s lineage is ○ and may add nothing; declared to share none, nobody has declared that they share lineage — never that they are independent', async () => {
  const [a, b] = [await api(() => '{"temperature":21,"sky":"clear"}'), await api(() => '{"temperature":21,"sky":"clear"}')];
  try {
    const p = await person(a.document, b.document);
    p.rooted([shares('mirror', 'forecast')]);
    const kin = await p.asked();
    ok(kin.every((c) => c.code === 'head/agreed-lineage' && c.fields.marks === own + other && c.fields.source === 'mirror' && c.fields.other === 'forecast'), JSON.stringify(kin.map((c) => [c.code, c.fields.marks])));
    const q = await person(a.document, b.document);
    q.rooted([shares('forecast', valueOf(lock, 'marks/undeclared')), shares('mirror', valueOf(lock, 'marks/undeclared'))]);
    const none = await q.asked();
    ok(none.every((c) => c.code === 'head/agreed-undeclared' && c.fields.marks === own + own), JSON.stringify(none.map((c) => c.code)));
    ok(!lock.some((l) => /don-t copy each other|do not copy each other/.test(l.about ?? '')), 'head never says that two sources do not copy each other');
  } finally { a.close(); b.close(); }
});

test('the same source in another form: two sources reached at the same origin are one, ○, though nobody declared it', async () => {
  const a = await api(() => '{"temperature":21,"sky":"clear"}');
  try {
    const got = await (await person(a.document, a.document)).asked();
    ok(got.length > 0 && got.every((c) => c.code === 'head/agreed-lineage' && c.fields.marks === own + other), JSON.stringify(got.map((c) => [c.code, c.fields.marks])));
  } finally { a.close(); }
});

test('the same source asked twice is one source: its second mark is ○, never a second ●, and it is read once', async () => {
  let reads = 0;
  const a = await api(() => { reads += 1; return '{"temperature":21,"sky":"clear"}'; }), b = await api(() => '{"temperature":21,"sky":"clear"}');
  try {
    const p = await person(a.document, b.document), before = reads, got = await p.asked('forecast|forecast');
    ok(got.length > 0 && got.every((c) => c.code === 'head/agreed-lineage' && c.fields.marks === own + other && c.fields.source === 'forecast' && c.fields.other === 'forecast'), JSON.stringify(got.map((c) => [c.code, c.fields.marks])));
    ok(reads - before <= 1, `the source was called ${reads - before} times for one question asked twice of it`);
  } finally { a.close(); b.close(); }
});
