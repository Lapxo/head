import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { api, text, viewOf } from './place.ts';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const op = (operationId: string, open = false) => ({ operationId, ...(open ? { security: [] } : {}), responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } } } });
/** An issuer that asks an email as a form, a code it sends asked once, a company chosen when the login answers several. */
const flow = { inputs: { properties: { email: { 'x-ask': 'form', title: 'your email' }, otp: { 'x-ask': 'one-time', 'x-ttl': 120, title: 'the code we sent you' },
  companyId: { 'x-ask': 'choice', 'x-from': '$steps.login.outputs.companies', 'x-label': '$steps.login.outputs.names' } } },
  steps: [{ stepId: 'request', operationId: 'requestOtp', requestBody: { payload: { email: '$inputs.email' } } },
    { stepId: 'login', operationId: 'loginOtp', requestBody: { payload: { email: '$inputs.email', otp: '$inputs.otp' } }, outputs: { token: '$response.body#/token', selection: '$response.body#/selectionToken', companies: '$response.body#/memberships/*/companyId', names: '$response.body#/memberships/*/companyName' } },
    { stepId: 'select', 'x-when': '$steps.login.outputs.selection', operationId: 'selectCompany', requestBody: { payload: { selectionToken: '$steps.login.outputs.selection', companyId: '$inputs.companyId' } }, outputs: { token: '$response.body#/token' } }],
  outputs: { token: ['$steps.select.outputs.token', '$steps.login.outputs.token'] }, 'x-attach': { in: 'header', name: 'Authorization', template: 'Bearer {token}' } };
const document = (title: string, server: string, paths: Record<string, unknown>, components: Record<string, unknown>, ref?: string) => JSON.stringify({ openapi: '3.0.3', info: { title, version: '1' }, servers: [{ url: server }], paths,
  ...(ref ? { security: [{ BearerAuth: [] }] } : {}), components: { ...components, ...(ref ? { securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer', 'x-access': { $ref: ref } } } } : {}) } });
const answers: Readonly<Record<string, string>> = { email: 'ana@example.test', otp: '123456', companyId: 'c-2', yes: 'true' };

/** A person at either kind of client: a form is answered field by field; a page sent by address is opened, and what it asks — by the names its fields carry — is posted back. */
const person = (seen: string[]) => async (params: any) => {
  if (params.mode !== 'url') { const fields = Object.keys(params.requestedSchema?.properties ?? {}); seen.push(`form ${fields.join(',')}`); return { action: 'accept', content: Object.fromEntries(fields.map((f) => [f, f === 'yes' ? true : answers[f]])) }; }
  const page = await (await fetch(params.url)).text();
  const fields = [...new Set([...page.matchAll(/<(?:input|select|button)[^>]* name="([^"]+)"/g)].map((m) => m[1]!))];
  seen.push(`page ${fields.join(',')}`);
  await fetch(params.url, { method: 'POST', body: new URLSearchParams(Object.fromEntries(fields.map((f) => [f, answers[f] ?? '']))) });
  return { action: 'accept' };
};

/** The same place, the same documents, the same API and the same answers, at a client that declares the given elicitation modes: what was asked, what was sent, what landed — each place's own keys aside. */
const run = async (modes: Readonly<Record<string, object>>, server: Awaited<ReturnType<typeof api>>) => {
  const shared = mkdtempSync(join(tmpdir(), 'head-channels-'));
  const [keychain, before] = [fakeKeychain({}), server.seen.length];
  const [env, dir, seen] = [{ ...keychain.env, HEAD_HOME: join(shared, 'home') }, join(shared, 'org'), [] as string[]];
  try {
    writeFileSync(join(shared, 'auth.json'), document('auth', server.url, { '/otp': { post: op('requestOtp', true) }, '/login': { post: op('loginOtp', true) }, '/select': { post: op('selectCompany', true) } }, { 'x-access': { org: flow } }));
    writeFileSync(join(shared, 'jobs.json'), document('jobs', server.url, { '/jobs': { get: op('list-jobs') } }, {}, 'auth.json#/components/x-access/org'));
    const at = (calls: readonly any[], roots: readonly string[] = []) => ask(calls, roots, env, person(seen), modes);
    await at([tool('place', { dir })]);
    for (const source of ['auth', 'jobs']) await at([tool('connect', { place: dir, source, document: join(shared, `${source}.json`) })], [shared]);
    const [accessed] = await at([tool('access', { place: dir, source: 'jobs' })]);
    const [read] = await at([tool('look', { place: dir, source: 'jobs', operation: 'list-jobs', at: '8' })]);
    const bare = (l: string) => l.replace(/ (sig|epoch)=("[^"]*"|\S+)/g, '').replace(/ at=(receipt|policy:head\/connect)[^ ]*/g, '').replace(/( measure=public-key .* value=)\S+/, '$1<its own key>').replace(/( scope=kept\/\S+\/)[0-9a-f]{16}( |$)/, '$1<its own basis>$2').replace(/( scope=(read|kept)\/jobs\/list-jobs\/)[0-9a-f]{16}/, '$1<the request as its own principal>').replace(/( scope=walk\/context value=)\S+/, '$1<its own context>');
    const own = viewOf(dir, 'evidence').split('\n').filter((l) => / by=head /.test(l));
    const requests = [...own.join('\n').matchAll(/ scope=(?:read|kept)\/jobs\/list-jobs\/([0-9a-f]{16})/g)].map((m) => m[1]);
    deepStrictEqual([requests.length, new Set(requests).size], [2, 1], 'the body and the typed answer are kept under one request, made as one principal');
    const lines = (file: string) => readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean).map(bare).sort();
    return { seen, said: [text(accessed).split('\n')[0], ...text(read).split('\n').filter((l) => !l.startsWith('red:')).map(bare)], lock: lines('TARGET.bound'), journal: own.map(bare).sort(),
      sent: server.seen.slice(before).map((one) => [one.method, one.url, one.body, one.headers['authorization'] ?? '']), kept: JSON.parse(Buffer.from(keychain.held(`place/${basename(dir)}/issuer/org`), 'base64url').toString('utf8')).secret };
  } finally { /* the API outlives each run */ }
};

test('an input is asked through the richest channel the client declares — its form, else head-s one-time page by address — and a yes the same way: the same flow at either client lands the same lines and receipts, sends the same requests and keeps the same token', async () => {
  const server = await api((url, body) => (url === '/otp' ? '{"success":true}' : url === '/login' ? [409, '{"selectionToken":"sel-1","memberships":[{"companyId":"c-1","companyName":"Acme"},{"companyId":"c-2","companyName":"Globex"}]}'] as const
    : url === '/select' && body.includes('sel-1') ? '{"token":"t-picked"}' : '{"id":1}'));
  const [formed, paged] = await (async () => { try { return [await run({ form: {}, url: {} }, server), await run({ url: {} }, server)]; } finally { await server.close(); } })();
  deepStrictEqual(formed.seen, ['form yes', 'form yes', 'form yes', 'form email', 'form otp', 'form companyId', 'form yes']);
  deepStrictEqual(paged.seen, ['page yes', 'page yes', 'page yes', 'page email', 'page otp', 'page companyId', 'page yes']);
  deepStrictEqual([paged.said, paged.lock, paged.journal, paged.sent, paged.kept], [formed.said, formed.lock, formed.journal, formed.sent, formed.kept]);
  ok(formed.sent.some(([, url, body]) => url === '/select' && String(body).includes('c-2')) && formed.kept === 't-picked', 'the company chosen is the one sent');
});
