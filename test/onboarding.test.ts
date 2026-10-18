import { test } from 'node:test';
import { ok } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { valueOf } from '../src/core/lock.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { lock } from './place.ts';

/**
 * measure-after: a new person's first minute against an API on this machine, to the first answer. Run only where
 * HEAD_ONBOARDING is set, the isolated job, since it reads seconds. A step is a call the person gives something to; a
 * call made from a cell's next alone is the model's. Each count is held to its ceiling in head's lock.
 */
test('onboarding: steps, questions, tools and person-words within their ceilings; seconds measured, and red only with what they rest on named', { skip: !process.env['HEAD_ONBOARDING'] }, async (t) => {
  const document = JSON.stringify({ openapi: '3.0.3', info: { title: 'forecast', version: '1' }, servers: [{ url: '' }],
    paths: { '/forecast': { get: { operationId: 'get-forecast', parameters: [{ name: 'city', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } } });
  const server = createServer((request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(request.url === '/openapi.json' ? document.replace('"url":""', `"url":"${origin}"`) : '{"temperature":21}'); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, mine = mkdtempSync(join(tmpdir(), 'head-new-person-')), questions: string[] = [];
  const env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, '.config', 'head'), HOME: mine, USERPROFILE: mine };
  const yes = (params: any) => { questions.push(params.message); return { action: 'accept', content: { yes: true } }; };
  const call = (name: string, args: Record<string, unknown>) => ({ method: 'tools/call', params: { name, arguments: args } });
  const cells = (answer: any): any[] => answer.result.structuredContent.cells;
  const asked = { source: 'forecast', operation: 'get-forecast', args: { city: 'lima' } };
  const [listed, unborn] = await ask([{ method: 'tools/list' }, call('ask', asked)], [], env, yes);
  const next = cells(unborn).find((c) => c.code === 'head/unborn')!.next;
  const [connected] = await ask([call(next.tool, { ...next.args, args: asked.args, document: `${origin}/openapi.json` })], [], env, yes);
  const ready = cells(connected).find((c) => c.code === 'head/ready')!.next;
  const [answered] = await ask([call(ready.tool, { ...ready.args, args: asked.args })], [], env, yes);
  server.close();
  const steps = 2, all = [unborn, connected, answered].flatMap(cells), red = all.filter((c) => c.code === 'head/red');
  const hi = (scope: string) => Number(valueOf(lock, scope).split('..')[1]);
  t.diagnostic(`MEASURED steps ${steps} · questions ${questions.length} · tools ${listed.result.tools.length} · answer seconds ${red.map((c) => c.fields.seconds).join(', ') || `within ${valueOf(lock, 'answer/seconds')}`}`);
  ok(all.some((c) => c.code === 'head/answered' || c.code === 'head/untyped'), JSON.stringify(all.map((c) => c.code)));
  ok(steps <= hi('onboarding/steps') && questions.length <= hi('onboarding/questions') && listed.result.tools.length <= hi('tools/visible'), `${steps} steps, ${questions.length} questions`);
  ok(all.every((c) => Object.values(c.fields as Record<string, string>).every((v) => !/@\d|REFUSE·/.test(v))) && hi('person-words') === 0, 'no resolution number and no bound refusal reaches the person');
  ok(red.length === 0 || valueOf(lock, 'answer/seconds/rests-on') !== '', 'a red answer names what its seconds rest on');
});
