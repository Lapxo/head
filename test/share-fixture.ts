import { test } from 'node:test';
import { deepStrictEqual, doesNotMatch, match, ok } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { said, text, viewOf } from './place.ts';


export const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
export const op = (operationId: string, open = false) => ({ operationId, ...(open ? { security: [] } : {}), responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } } } });
export const flow = { inputs: { properties: { email: { 'x-ask': 'form' } } }, outputs: { token: '$steps.login.outputs.token' }, 'x-attach': { in: 'header', name: 'Authorization', template: 'Bearer {token}' },
  steps: [{ stepId: 'login', operationId: 'login', requestBody: { payload: { email: '$inputs.email' } }, outputs: { token: '$response.body#/token' } }] };
export const auth = JSON.stringify({ openapi: '3.0.3', info: { title: 'auth', version: '1' }, servers: [{ url: 'https://org.example' }], paths: { '/login': { post: op('login', true) } }, components: { 'x-access': { portal: flow } } });
export const jobs = JSON.stringify({ openapi: '3.0.3', info: { title: 'jobs', version: '1' }, servers: [{ url: 'https://org.example' }], paths: { '/jobs': { get: op('list-jobs') } }, security: [{ BearerAuth: [] }],
  components: { securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer', 'x-access': { $ref: 'auth.json#/components/x-access/portal' } } } } });
export const overlay = ['overlay: 1.0.0', 'info: { title: jobs described, version: "1" }', 'extends: jobs.json', 'actions:', '  - target: $.info', '    update:', '      description: the jobs of the org', ''].join('\n');
export const digestOf = (bytes: string | Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export const pinsOf = (dir: string) => readFileSync(join(dir, 'TARGET.bound'), 'utf8').split('\n').filter((l) => / scope=uses\/(auth|jobs) /.test(l)).map((l) => `${/ scope=(\S+)/.exec(l)![1]} ${/ value=(\S+)/.exec(l)![1]}`).sort();
export const yes = (asked: string[]) => (params: any) => { asked.push(params.message); return { action: 'accept', content: { yes: true } }; };

/** A place of two sources, connected out of the order they rest in — jobs before the auth whose issuer it names, jobs with an overlay — packed by share into a folder the client shares. */
export const sender = async () => {
  const [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-share-'))];
  const env = { ...fakeKeychain({}).env, HEAD_HOME: home }, place = join(shared, 'org'), pkg = join(shared, 'package');
  writeFileSync(join(shared, 'auth.json'), auth); writeFileSync(join(shared, 'jobs.json'), jobs); writeFileSync(join(shared, 'jobs.overlay.yaml'), overlay);
  await ask([tool('place', { dir: place })], [], env, yes([]));
  await ask([tool('connect', { place, source: 'jobs', document: join(shared, 'jobs.json'), overlay: join(shared, 'jobs.overlay.yaml') })], [shared], env, yes([]));
  await ask([tool('connect', { place, source: 'auth', document: join(shared, 'auth.json') })], [shared], env, yes([]));
  const [packed] = await ask([tool('share', { place, to: pkg })], [shared], env);
  return { place, pkg, shared, env, packed: text(packed), digest: /sha256:[0-9a-f]{64}/.exec(text(packed).split('\n')[0]!)?.[0] ?? '' };
};
/** A place of its own, on another device: its own home, its own keychain, nothing connected. */
export const receiver = async () => {
  const keychain = fakeKeychain({}), env = { ...keychain.env, HEAD_HOME: mkdtempSync(join(tmpdir(), 'head-home-')) }, place = join(mkdtempSync(join(tmpdir(), 'head-receive-')), 'mine');
  await ask([tool('place', { dir: place })], [], env, yes([]));
  return { place, env, keychain };
};
export const receive = (to: { place: string; env: Record<string, string> }, pkg: string, digest: string, asked: string[], roots: readonly string[]) => ask([tool('connect', { place: to.place, document: join(pkg, 'TARGET.bound'), digest })], roots, to.env, yes(asked));
/** A package re-said: its lock rewritten by a change, and the digest it is then named by. */
export const resaid = (pkg: string, change: (lines: string[]) => string[]) => { const lock = `${change(readFileSync(join(pkg, 'TARGET.bound'), 'utf8').trimEnd().split('\n')).join('\n')}\n`; writeFileSync(join(pkg, 'TARGET.bound'), lock); return digestOf(lock); };

/** Encrypted addresses as a bucket hands them out, here on this device: each object behind its own signed address, every other one moved first; every request kept with what it carried. */
export const bucket = async (objects: Map<string, string>) => {
  const seen: { url: string; authorization: string }[] = [];
  const server = createServer((request, response) => { const url = request.url ?? ''; seen.push({ url, authorization: String(request.headers['authorization'] ?? '') });
    const [path, n] = [url.split('?')[0]!, Number(/^\/signed\/(\d+)/.exec(url)?.[1] ?? -1)];
    if (n >= 0 && n % 2 === 1) { response.writeHead(302, { location: `/blob/${n}` }); response.end(); return; }
    const body = objects.get(n >= 0 ? `/blob/${n}` : path); response.writeHead(body === undefined ? 404 : 200); response.end(body ?? ''); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) };
};
