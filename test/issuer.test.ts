import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { api, said, text, viewOf } from './place.ts';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const op = (operationId: string, open = false) => ({ operationId, ...(open ? { security: [] } : {}), responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } } } });
/** A flow an issuer declares once: the one input it asks as a form, one login step of its own document, the token it answers, carried as a bearer. */
const flow = (login: string, field: string) => ({ inputs: { properties: { [field]: { 'x-ask': 'form' } } }, outputs: { token: '$steps.login.outputs.token' }, 'x-attach': { in: 'header', name: 'Authorization', template: 'Bearer {token}' },
  steps: [{ stepId: 'login', operationId: login, requestBody: { payload: { [field]: `$inputs.${field}` } }, outputs: { token: '$response.body#/token' } }] });
const document = (title: string, server: string, paths: Record<string, unknown>, components: Record<string, unknown>, ref?: string) => JSON.stringify({ openapi: '3.0.3', info: { title, version: '1' }, servers: [{ url: server }], paths,
  ...(ref ? { security: [{ BearerAuth: [] }] } : {}), components: { ...components, ...(ref ? { securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer', 'x-access': { $ref: ref } } } } : {}) } });
const pinsOf = (lock: string) => lock.split('\n').filter((l) => / scope=uses\/(auth|jobs|people|timesheets) /.test(l)).sort();

test('access belongs to its issuer: declared once and referred to across documents, three regions read after one access — one prompt, one login, one token, one grant — and a fourth region with an issuer of its own gets its own flow, nothing else changed', async () => {
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-issuer-'))];
  const server = await api((url) => (url === '/login' ? '{"token":"t-org"}' : url === '/books-login' ? '{"token":"t-books"}' : '{"id":1}'));
  const keychain = fakeKeychain({});
  const env = { ...keychain.env, HEAD_HOME: home };
  const [dir, asked] = [join(shared, 'org'), [] as string[]];
  const person = (params: any) => ((fields) => { asked.push(fields.join(',')); return { action: 'accept', content: fields.includes('yes') ? { yes: true } : Object.fromEntries(fields.map((f) => [f, `${f}-of-ana`])) }; })(Object.keys(params.requestedSchema?.properties ?? {}));
  const lock = () => readFileSync(join(dir, 'TARGET.bound'), 'utf8');
  const standing = (source: string) => readFileSync(join(dir, / needs=(\S+)/.exec(lock().split('\n').find((l) => l.includes(` scope=uses/${source} `))!)![1]!), 'utf8').split('\n');
  const flowIn = (source: string) => standing(source).filter((l) => / scope=keys\/access\/portal[ /]/.test(l));
  const connect = (source: string) => ask([tool('connect', { place: dir, source, document: join(shared, `${source}.json`) })], [shared], env, person);
  const look = (source: string) => tool('look', { place: dir, source, operation: `list-${source}`, at: '8' });
  try {
    writeFileSync(join(shared, 'auth.json'), document('auth', server.url, { '/login': { post: op('login', true) } }, { 'x-access': { portal: flow('login', 'email') } }));
    for (const name of ['jobs', 'people', 'timesheets']) writeFileSync(join(shared, `${name}.json`), document(name, server.url, { [`/${name}`]: { get: op(`list-${name}`) } }, {}, 'auth.json#/components/x-access/portal'));
    writeFileSync(join(shared, 'ledger.json'), document('ledger', server.url, { '/books-login': { post: op('books-login', true) }, '/ledger': { get: op('list-ledger') } }, { 'x-access': { books: flow('books-login', 'user') } }, '#/components/x-access/books'));
    await ask([tool('place', { dir })], [], env, person);
    for (const source of ['auth', 'jobs', 'people', 'timesheets']) await connect(source);
    const [flowLines, pins] = [flowIn('auth'), pinsOf(lock())];
    ok(flowLines.some((l) => / measure=operation .*scope=keys\/access\/portal\/steps\/1 value=login$/.test(l)) && standing('auth').some((l) => / measure=issuers .*scope=region\/auth value=portal$/.test(l)), 'the flow compiles once, in the document that declares it');
    for (const s of ['jobs', 'people', 'timesheets']) deepStrictEqual([flowIn(s).length, standing(s).filter((l) => / measure=issuer /.test(l)).map((l) => / scope=(\S+) value=(\S+)$/.exec(l)!.slice(1).join(' '))], [0, [`keys/access/${s}/BearerAuth portal`]], 'each API says only which issuer');
    const [connected] = await connect('ledger');
    match(text(connected), said('connected'));
    deepStrictEqual([flowIn('auth'), pinsOf(lock()), pins.length], [flowLines, pins, 4], 'a fourth region connected changes nothing of the other four');
    asked.length = 0;
    const [accessed] = await ask([tool('access', { place: dir, source: 'jobs' })], [], env, person);
    const reads = await ask([look('jobs'), look('people'), look('timesheets')], [], env, person);
    match(text(accessed), said('access-kept'));
    const [own] = await ask([look('ledger')], [], env, person);
    for (const [one, source] of [...reads.map((r, i) => [r, ['jobs', 'people', 'timesheets'][i]!] as const), [own, 'ledger'] as const]) match(text(one), new RegExp(`^${source} answered 200 to list-${source}\\.[\\s\\S]* measure=number .*value=1\\n`));
    deepStrictEqual(server.seen.map((one) => [one.url, one.headers['authorization'] ?? '']), [['/login', ''], ['/jobs', 'Bearer t-org'], ['/people', 'Bearer t-org'], ['/timesheets', 'Bearer t-org'], ['/books-login', ''], ['/ledger', 'Bearer t-books']]);
    deepStrictEqual([JSON.parse(server.seen[0]!.body), JSON.parse(server.seen[4]!.body)], [{ email: 'email-of-ana' }, { user: 'user-of-ana' }]);
    deepStrictEqual(asked, ['email', 'yes', 'user'], 'one prompt per issuer and one grant for the place');
    deepStrictEqual(['place/org/issuer/portal', 'place/org/issuer/books', ...['jobs', 'people', 'timesheets', 'ledger'].map((s) => `place/org/api/${s}`)].map((a) => keychain.held(a).length > 0), [true, true, false, false, false, false], 'one token per issuer, none per source');
    const journal = viewOf(dir, 'evidence');
    deepStrictEqual(['portal', 'books', 'jobs', 'ledger'].map((f) => journal.match(new RegExp(` scope=access/${f}/obtained `, 'g'))?.length ?? 0), [1, 1, 0, 0]);
    deepStrictEqual(lock().split('\n').filter((l) => / scope=allow\/read /.test(l) && / measure=sources /.test(l)).length, 1);
  } finally { await server.close(); }
});

test('an unresolved reference is a demand the issuer-s connect pays: jobs connected before auth compiles unresolved and says so; connecting auth compiles jobs again — never reconnected — and one access then reads it; a reference to a document no connect brings stays a demand, its pin untouched', async () => {
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-owed-'))];
  const server = await api((url) => (url === '/login' ? '{"token":"t-org"}' : '{"id":1}'));
  const keychain = fakeKeychain({});
  const env = { ...keychain.env, HEAD_HOME: home };
  const [dir, asked] = [join(shared, 'org'), [] as string[]];
  const person = (params: any) => ((fields) => { asked.push(fields.join(',')); return { action: 'accept', content: fields.includes('yes') ? { yes: true } : Object.fromEntries(fields.map((f) => [f, `${f}-of-ana`])) }; })(Object.keys(params.requestedSchema?.properties ?? {}));
  const lock = () => readFileSync(join(dir, 'TARGET.bound'), 'utf8');
  const pinOf = (source: string) => lock().split('\n').find((l) => l.includes(` scope=uses/${source} `)) ?? '';
  const standing = (source: string) => readFileSync(join(dir, / needs=(\S+)/.exec(pinOf(source))![1]!), 'utf8');
  const connect = (source: string) => ask([tool('connect', { place: dir, source, document: join(shared, `${source}.json`) })], [shared], env, person);
  try {
    writeFileSync(join(shared, 'auth.json'), document('auth', server.url, { '/login': { post: op('login', true) } }, { 'x-access': { portal: flow('login', 'email') } }));
    writeFileSync(join(shared, 'jobs.json'), document('jobs', server.url, { '/jobs': { get: op('list-jobs') } }, {}, 'auth.json#/components/x-access/portal'));
    writeFileSync(join(shared, 'payroll.json'), document('payroll', server.url, { '/payroll': { get: op('list-payroll') } }, {}, 'hr.json#/components/x-access/hr'));
    await ask([tool('place', { dir })], [], env, person);
    const [early] = await connect('jobs');
    await connect('payroll');
    match(text(early), said('unresolved')); match(text(early), /auth\.json#\/components\/x-access\/portal/);
    match(standing('jobs'), / measure=unresolved .*scope=keys\/access\/jobs\/BearerAuth value=auth\.json#\/components\/x-access\/portal$/m);
    const [jobsBefore, payrollBefore] = [pinOf('jobs'), pinOf('payroll')];
    const [late] = await connect('auth');
    match(text(late), said('resolved')); match(text(late), /^jobs referred to auth before it was here/m); ok(!/^payroll referred/m.test(text(late)), text(late));
    ok(pinOf('jobs') !== jobsBefore && !standing('jobs').includes('measure=unresolved') && / measure=issuer .*scope=keys\/access\/jobs\/BearerAuth value=portal$/m.test(standing('jobs')), standing('jobs'));
    deepStrictEqual([pinOf('payroll'), lock().match(/ scope=uses\/jobs /g)?.length], [payrollBefore, 1], 'a demand no connect paid keeps its pin; a recompiled pin replaces its old one');
    asked.length = 0;
    const [read] = await ask([tool('look', { place: dir, source: 'jobs', operation: 'list-jobs', at: '8' })], [], env, person);
    match(text(read), /^jobs answered 200 to list-jobs\./);
    deepStrictEqual([asked, server.seen.map((one) => [one.url, one.headers['authorization'] ?? ''])], [['yes', 'email'], [['/login', ''], ['/jobs', 'Bearer t-org']]]);
  } finally { await server.close(); }
});
