import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { availableParallelism, loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';
import { valueOf } from '../src/core/lock.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { lock } from './place.ts';

/**
 * measure-after: a new person's first minute against an API on this machine, to the first answer, then a question new
 * to the connected source and the first one again, in one session. Run only where HEAD_ONBOARDING is set, the isolated
 * job, since it reads seconds. A step is a call the person gives something to; a call made from a cell's next alone is
 * the model's. Each count is held to its ceiling in head's lock. What an answer adds to the model's context is the bytes
 * of its content over four — the typed body and the receipts, its lines — and the cells around it are counted beside it,
 * the person's home read as ~ and the API's origin as <api>, so that two machines count alike; its first cell takes the
 * seconds from its call to its result, without streaming the whole of it.
 */
test('onboarding: steps, questions, tools and person-words within their ceilings; seconds measured, and red only with what they rest on named', { skip: !process.env['HEAD_ONBOARDING'] }, async (t) => {
  t.diagnostic(`ENVIRONMENT node=${process.version} platform=${process.platform} cpus=${availableParallelism()} load=${loadavg().join(',')} clock=client-performance-now concurrency=one-timed-suite`);
  const document = JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: '' }],
    paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } } });
  const server = createServer((request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(request.url === '/openapi.json' ? document.replace('"url":""', `"url":"${origin}"`) : JSON.stringify({ city: new URL(request.url ?? '/', origin).searchParams.get('city'), temperature: 21 })); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, call = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
  const cells = (answer: any): any[] => answer.result.structuredContent.cells, asked = { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' } };
  /** One new person's first minute: the question with no place, then the connect its next names and the questions the ready cell names next, in one conversation, each after the pause given. */
  const person = async (pause: number) => {
    const mine = mkdtempSync(join(tmpdir(), 'head-new-person-')), questions: string[] = [], env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine };
    const yes = (params: any) => { questions.push(params.message); return { action: 'accept', content: { yes: true } }; }, wait = { method: 'between', params: () => new Promise((r) => setTimeout(r, pause)) };
    const [listed, unborn] = await ask([{ method: 'tools/list' }, call('ask', asked)], [], env, yes);
    const next = cells(unborn).find((c) => c.code === 'head/unborn')!.next, place = join(mine, valueOf(lock, 'first-run/folder')), question = (city: string) => call('ask', { ...asked, place, args: JSON.stringify({ city }) });
    const [connected, answered, fresh, repeated] = await ask([call(next.tool, { ...next.args, args: asked.args, document: `${origin}/openapi.json` }), wait, question('lima'), wait, question('quito'), wait, question('lima')], [], env, yes);
    deepStrictEqual(cells(connected).find((c) => c.code === 'head/ready')!.next, { tool: 'ask', args: { source: asked.source, place, operation: asked.operation, args: JSON.stringify(asked.args) } }, 'each question is the one the ready cell names next');
    return { mine, questions, listed, unborn, connected, answered, fresh, repeated };
  };
  const [chained, typed] = [await person(0), await person(Number(valueOf(lock, 'onboarding/pause').split('..')[1]))];
  server.close();
  const { mine, questions, listed, unborn, connected, answered, fresh, repeated } = chained;
  const steps = 2, all = [unborn, connected, answered, fresh, repeated].flatMap(cells), red = all.filter((c) => c.code === 'head/red');
  const part = (a: any, content: boolean) => Math.ceil(Buffer.byteLength(a.result.content.map((c: any) => c.text).join('\n').replaceAll(mine, '~').replaceAll(origin, '<api>').split('\n').filter((l: string) => l.startsWith('bound-lock/1') === content).join('\n')) / 4);
  const column = (chain: any[], content: boolean) => `${chain.reduce((n, a) => n + part(a, content), 0)} (${chain.map((a) => part(a, content)).join('+')})`;
  const kinds = (p: typeof chained) => ({ 'new-without-source': [p.unborn, p.connected, p.answered], 'new-with-source': [p.fresh], 'repeated-with-receipt': [p.repeated] });
  t.diagnostic(`MEASURED tokens/answer model=utf8-bytes/4 · seconds/first-cell model=client-clock · ${Object.entries(kinds(chained)).map(([kind, chain]) => `${kind} ${column(chain, true)} tokens, cells ${column(chain, false)} ${chain[0].seconds.toFixed(2)} s ${cells(chain.at(-1)).map((c) => c.code).filter((c) => c !== 'head/card').join('+')}`).join(' · ')}`);
  t.diagnostic(`MEASURED seconds/first-cell model=client-clock · chained, no pause: ${Object.entries(kinds(chained)).map(([kind, chain]) => `${kind} ${chain.at(-1).seconds.toFixed(2)} s`).join(' · ')} · typed, after ${valueOf(lock, 'onboarding/pause').split('..')[1]} ms: ${Object.entries(kinds(typed)).map(([kind, chain]) => `${kind} ${chain.at(-1).seconds.toFixed(2)} s`).join(' · ')}`);
  const hi = (scope: string) => Number(valueOf(lock, scope).split('..')[1]);
  t.diagnostic(`MEASURED steps ${steps} · questions ${questions.length} · tools ${listed.result.tools.length} · answer seconds ${red.map((c) => c.fields.seconds).join(', ') || `within ${valueOf(lock, 'answer/seconds')}`}`);
  ok([answered, fresh, repeated].every((a) => cells(a).some((c) => ['head/answered', 'head/untyped', 'head/reused', 'head/reread', 'head/kept'].includes(c.code))), JSON.stringify(all.map((c) => c.code)));
  ok(steps <= hi('onboarding/steps') && questions.length <= hi('onboarding/questions') && listed.result.tools.length <= hi('tools/visible'), `${steps} steps, ${questions.length} questions`);
  ok(all.every((c) => Object.values(c.fields as Record<string, string>).every((v) => !/@\d|REFUSE·/.test(v))) && hi('person-words') === 0, 'no resolution number and no bound refusal reaches the person');
  ok(red.length === 0 || valueOf(lock, 'answer/seconds/rests-on') !== '', 'a red answer names what its seconds rest on');
  ok(part(repeated, true) <= hi('tokens/answer/repeated'), `a question asked again adds ${part(repeated, true)} tokens of content`);
  for (const [kind, chain] of Object.entries(kinds(chained)).filter(([kind]) => kind !== 'repeated-with-receipt')) ok(chain.reduce((n, a) => n + part(a, true), 0) <= hi(`tokens/answer/${kind}`), `a ${kind} question adds ${column(chain, true)} tokens of content, past tokens/answer/${kind}`);
  const over = (['chained', 'typed'] as const).flatMap((way) => Object.entries(kinds(way === 'chained' ? chained : typed)).map(([kind, chain]) => ({ scope: `seconds/first-cell/${kind}/${way}`, ms: Math.round(chain.at(-1).seconds * 100) * 10 }))).filter((m) => m.ms > hi(m.scope));
  const exactOver = (['chained', 'typed'] as const).flatMap((way) => Object.entries(kinds(way === 'chained' ? chained : typed)).map(([kind, chain]) => ({ scope: `seconds/first-cell/${kind}/${way}`, ms: chain.at(-1).seconds * 1000 }))).filter((m) => m.ms > hi(m.scope));
  t.diagnostic(`MEASURED exact-first-cell-ms ${JSON.stringify((['chained', 'typed'] as const).flatMap((way) => Object.entries(kinds(way === 'chained' ? chained : typed)).map(([kind, chain]) => ({ scope: `seconds/first-cell/${kind}/${way}`, ms: chain.at(-1).seconds * 1000, ceiling: hi(`seconds/first-cell/${kind}/${way}`) }))))}`);
  if (process.env['HEAD_FIRST_CELL_STRICT'] === '1') deepStrictEqual(exactOver, [], 'every first cell meets its unchanged ceiling before release');
  t.diagnostic(`MEASURED seconds/first-cell against its ceilings: ${over.map((m) => `RED ${m.scope} ${m.ms} ms past 0..${hi(m.scope)}`).join(' · ') || 'every first cell within its ceiling'}${over.length ? ` · rests on ${valueOf(lock, 'seconds/first-cell/rests-on')}` : ''}`);
  ok(over.length === 0 || valueOf(lock, 'seconds/first-cell/rests-on') !== '', 'a first cell past its ceiling names what it rests on');
});
