import { test } from 'node:test';
import { deepStrictEqual, match, notStrictEqual, ok } from 'node:assert';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, parse } from '@lapxo/topos/wire';
import { run } from './cli.ts';
import { registryFor } from '../src/ports/signers.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { api, said, text } from './place.ts';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const yes = (params: any) => (params.requestedSchema?.properties?.yes ? { action: 'accept', content: { yes: true } } : { action: 'accept', content: {} });
const spec = (server: string) => JSON.stringify({ openapi: '3.0.3', info: { title: 'things', version: '1' }, servers: [{ url: server }],
  paths: { '/things': { get: { operationId: 'listThings', security: [], responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' } } } } } } } } }, post: { operationId: 'addThing', security: [], responses: { 201: { description: 'made' } } } } } });

test('who configures is not who asks: the organisation-s head connects and grants, admits a member-s device by name; the member asks without a question, and every widening it would need is handed to whoever configures', async () => {
  const [shared, server] = [mkdtempSync(join(tmpdir(), 'head-org-')), await api(() => '[{"id":1}]')];
  const admin = { ...fakeKeychain({}).env, HEAD_HOME: join(shared, 'org-head') };
  const member = { ...fakeKeychain({}).env, HEAD_HOME: join(shared, 'my-head') };
  const org = join(shared, 'org');
  let asked = 0;
  const counted = () => { asked += 1; return { action: 'decline' }; };
  try {
    writeFileSync(join(shared, 'things.json'), spec(server.url));
    await ask([tool('place', { dir: org })], [], admin, yes);
    await ask([tool('connect', { place: org, source: 'things', document: join(shared, 'things.json') })], [shared], admin, yes);
    const [granted] = await ask([tool('look', { place: org, source: 'things', operation: 'listThings', at: '8' })], [], admin, yes);
    match(text(granted), said('answered')); const policy = readFileSync(join(org, 'TARGET.bound'), 'utf8');
    match(policy, / by=root .*scope=allow\/read .*value=things witness=person$/m); match(policy, / measure=public-key .*scope=keys\/person /);
    const [key] = await ask([tool('key', { who: 'head' })], [], member);
    const [admitted] = await ask([tool('admit', { place: org, key: text(key), name: 'Ana' })], [], admin, yes);
    match(text(admitted), said('admitted')); match(text(admitted), / measure=coverage role=writes scope=keys\/ana .*value=read\/\*\*\|kept\/\*\*\|access\/\*\*/);
    const reuse = canonical({ at: 'policy:person/reuse', by: 'target', form: 'interval', measure: 'seconds', role: 'writes', scope: 'allow/reuse/things', value: '0..600' });
    const [proposed] = await ask([tool('plan', { place: org, lines: reuse })], [], admin, yes);
    match(text((await ask([tool('land', { lot: /Lot (sha256:[0-9a-f]+)/.exec(text(proposed))?.[1] ?? '' })], [], admin))[0]), said('landed'));
    const look = (operation: string, at: string) => tool('look', { place: org, source: 'things', operation, at });
    const [offered, read, again] = await ask([look('listThings', '1'), look('listThings', '8'), look('listThings', '8')], [], member, counted);
    ok(text(offered).includes('scope=offers/things/listThings '), text(offered));
    match(text(read), said('answered')); match(text(read), / by=ana .*scope=read\/things\/listThings\/[0-9a-f]{16} sig=/); match(text(again), said('reused'));
    const plan = tool('plan', { place: org, lines: canonical({ at: 'policy:person/allows', by: 'target', form: 'interval', measure: 'calls', role: 'writes', scope: 'allow/things/addThing', value: '0..1' }) });
    const [acted, connected, readmitted, planned] = await ask([tool('act', { place: org, source: 'things', operation: 'addThing' }),
      tool('connect', { place: org, source: 'more', document: join(shared, 'things.json') }), tool('admit', { place: org, key: text(key), name: 'bob' }), plan], [shared], member, counted);
    match(text(acted), said('not-covered')); match(text(acted), /act\/things\/addThing\//);
    match(text(connected), said('no-root')); match(text(readmitted), said('no-root'));
    match(text(planned), said('not-covered')); match(text(planned), / scope=allow\/things\/addThing value=0\.\.1$/m);
    deepStrictEqual([asked, server.seen.map((one) => [one.method, one.url])], [0, [['GET', '/things'], ['GET', '/things']]]);
  } finally { await server.close(); }
});

test('two heads on one keychain never share a key: each is its home, its keys kept under a service of its own, and each founds a place of the same name', async () => {
  const shared = mkdtempSync(join(tmpdir(), 'head-two-'));
  const keychain = fakeKeychain({});
  const [first, second] = ['org-head', 'my-head'].map((home) => ({ ...keychain.env, HEAD_HOME: join(shared, home) }));
  const [a] = await ask([tool('place', { dir: join(shared, 'one', 'shop') })], [], first, yes);
  const [b] = await ask([tool('place', { dir: join(shared, 'two', 'shop') })], [], second, yes);
  match(text(a), said('born')); match(text(b), said('born'));
  const [ka, kb] = [await ask([tool('key', { who: 'head' })], [], first), await ask([tool('key', { who: 'head' })], [], second)].map(([one]) => / measure=public-key .*value=(\S+)/.exec(text(one))?.[1]);
  ok(ka && kb); notStrictEqual(ka, kb);
  deepStrictEqual(['@lapxo/head/org-head', '@lapxo/head/my-head'].map((service) => keychain.held('place/shop/root', service).length > 0), [true, true]);
  ok(readdirSync(join(shared, 'org-head')).includes('TARGET.bound') && readdirSync(join(shared, 'my-head')).includes('TARGET.bound'));
});

test('a place born before its wire named a witness gets it by one lot head proposes — its wire withdrawn and said again — signed by its root alone, planned and landed, never migrated', async () => {
  const [shared, server] = [mkdtempSync(join(tmpdir(), 'head-old-')), await api(() => '[{"id":1}]')];
  const keychain = fakeKeychain({});
  const env = { ...keychain.env, HEAD_HOME: join(shared, 'home') };
  const [dir, lock] = [join(shared, 'old'), () => readFileSync(join(shared, 'old', 'TARGET.bound'), 'utf8')];
  try {
    writeFileSync(join(shared, 'things.json'), spec(server.url));
    await ask([tool('place', { dir })], [], env, yes);
    await ask([tool('connect', { place: dir, source: 'things', document: join(shared, 'things.json') })], [shared], env, yes);
    const wire = ((got) => (got.kind === 'fact' ? got.value.fields : {}))(parse(/^.* scope=wire\/fields .*$/m.exec(lock())![0]));
    const older = join(mkdtempSync(join(tmpdir(), 'head-lot-')), 'older.bound');
    const bare = Object.fromEntries(Object.entries(wire).filter(([k]) => !['sig', 'epoch'].includes(k)));
    writeFileSync(older, `${[canonical({ ...bare, by: 'target', value: 'withdraw' }), canonical({ ...bare, by: 'target', at: 'policy:fixture/older', value: wire['value']!.replace('|witness', '') })].join('\n')}\n`);
    const signers = registryFor('keychain', `@lapxo/head/${basename(env.HEAD_HOME)}`, 'place/old/root', 'root', 'ed25519:era1');
    deepStrictEqual(run('@lapxo/bound', dir, ['land', older, '--key', 'root', '--signer', 'keychain'], { ...env, BOUND_SIGNERS: signers })?.code, 0);
    const look = tool('look', { place: dir, source: 'things', operation: 'listThings', at: '8' });
    const [unwitnessed] = await ask([look], [], env, yes);
    const proposed = text(unwitnessed).split('\n').slice(1);
    match(text(unwitnessed), said('unwitnessed')); deepStrictEqual(proposed.length, 2);
    match(proposed[0]!, / at=policy:fixture\/older by=target .*scope=wire\/fields value=withdraw$/); match(proposed[1]!, / by=target .*scope=wire\/fields value=.*\|witness$/);
    const [planned] = await ask([tool('plan', { place: dir, lines: proposed.join('\n') })], [], env, yes);
    const [landed] = await ask([tool('land', { lot: /Lot (sha256:[0-9a-f]+)/.exec(text(planned))?.[1] ?? '' })], [], env);
    match(text(landed), said('landed'));
    const [read] = await ask([look], [], env, yes);
    match(text(read), said('answered')); match(lock(), / by=root .*scope=allow\/read .*witness=person$/m); deepStrictEqual(lock().match(/ scope=wire\/fields /g)?.length, 1);
    deepStrictEqual(server.seen.length, 1);
  } finally { await server.close(); }
});
