import { homeServices } from '../src/ports/home.ts';
import { deepStrictEqual, ok } from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from '@lapxo/topos/wire';
import { publicOf } from '../src/ports/keys.ts';
import { planRead } from '../src/core/read.ts';
import { opened } from '../src/access/obtain.ts';
import { lockAt } from '../src/ports/place.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { api, text } from './place.ts';
import { run } from './cli.ts';

const digest = (x: Uint8Array | string) => 'sha256:' + createHash('sha256').update(x).digest('hex');
const flow = {
  inputs: { properties: { email: { 'x-ask': 'form' }, otp: { 'x-ask': 'one-time', 'x-ttl': 120 }, workspaceId: { 'x-ask': 'choice', 'x-from': '$steps.login.outputs.ids', 'x-label': '$steps.login.outputs.labels' } } },
  steps: [
    { stepId: 'request', operationId: 'requestCode', requestBody: { payload: { email: '$inputs.email' } } },
    { stepId: 'login', operationId: 'completeLogin', requestBody: { payload: { email: '$inputs.email', otp: '$inputs.otp' } }, outputs: { selection: '$response.body#/selection', ids: '$response.body#/workspaces/*/id', labels: '$response.body#/workspaces/*/label' } },
    { stepId: 'select', operationId: 'chooseWorkspace', requestBody: { payload: { selection: '$steps.login.outputs.selection', workspaceId: '$inputs.workspaceId' } }, outputs: { token: '$response.body#/token' } },
  ], outputs: { token: '$steps.select.outputs.token' }, 'x-attach': { in: 'header', name: 'Authorization', template: 'Bearer {token}' },
};
const operation = (operationId: string, anonymous = true) => ({ operationId, ...(anonymous ? { security: [] } : {}), responses: { 200: { description: 'ok' } } });

/** Two local APIs; one persistent disposable keychain for all recipient processes. No real account or API is used. */
export async function receiverAccess(baseBundle: string, pathAliases = false) {
  const scratch = mkdtempSync(join(tmpdir(), 'head-receiver-access-')), installed = join(scratch, 'base'), shared = join(scratch, 'documents');
  mkdirSync(shared); execFileSync('unzip', ['-q', baseBundle, '-d', installed]);
  const prior = process.env['HEAD_ENTRY'], senderKeys = fakeKeychain({}), receiverKeys = fakeKeychain({});
  const senderEnv = { ...senderKeys.env, HEAD_HOME: join(scratch, 'sender-index'), HOME: scratch };
  const personal = join(scratch, 'recipient'), receiverEnv = { ...receiverKeys.env, HEAD_HOME: join(scratch, 'receiver-index'), HOME: personal };
  mkdirSync(personal);
  const calls: unknown[] = [], events: string[] = [];
  const servers: Awaited<ReturnType<typeof api>>[] = [];
  const person = (params: any) => {
    const fields = Object.keys(params.requestedSchema?.properties ?? {});
    events.push(fields.join(','));
    return { action: 'accept', content: Object.fromEntries(fields.map(name => [name, name === 'yes' ? true : name === 'origin' ? servers[1]!.url : name === 'email' ? 'reader@example.test' : name === 'otp' ? '123456' : name === 'workspaceId' ? 'two' : ''])) };
  };
  const call = async (entry: string, env: Record<string, string>, name: string, args: Record<string, string>, consent?: (params: any) => any, roots: readonly string[] = []) => {
    process.env['HEAD_ENTRY'] = entry;
    const [got] = await ask([{ method: 'tools/call', params: { name, arguments: args } }], roots, env, consent);
    calls.push({ name, result: got }); return got;
  };
  const facts = (place: string) => {
    const got = run('@lapxo/bound', place, ['fold', '--as', 'lines']); ok(got?.code === 0, got?.err.join('\n'));
    return got.out.map(line => parse(line)).flatMap(p => p.kind === 'fact' ? [p.value.fields] : []);
  };
  const snapshot = (place: string) => {
    const rows = facts(place), index = facts(receiverEnv.HEAD_HOME), named = index.filter(f => f.scope?.startsWith('places/') && f.value === place);
    const localName = named[0]?.scope?.slice('places/'.length), account = `place/${localName}/root`;
    const root = rows.find(f => f.scope === 'keys/root' && f.measure === 'public-key')?.value;
    const secret = receiverKeys.held(account, homeServices('@lapxo/head', receiverEnv.HEAD_HOME).primary);
    return { localName, rootKeyDigest: root && digest(root), rootAccountPublicMatches: !!secret && publicOf(secret) === root,
      head: rows.find(f => f.scope === 'keys/head' && f.measure === 'public-key')?.value,
      person: rows.find(f => f.scope === 'keys/person' && f.measure === 'public-key')?.value,
      headCoverage: rows.find(f => f.scope === 'keys/head' && f.measure === 'coverage')?.value,
      personCoverage: rows.find(f => f.scope === 'keys/person' && f.measure === 'coverage')?.value };
  };
  const aliases = (place: string) => pathAliases ? place + '/.' : place;
  const domains: unknown[] = [];
  try {
    for (const label of ['records', 'readings']) {
      const start = calls.length; events.length = 0; const token = 'synthetic-' + randomUUID();
      const respond = (path: string) => path === '/code' ? '{"sent":true}' : path === '/login' ? [409, '{"selection":"select","workspaces":[{"id":"one","label":"First"},{"id":"two","label":"Second"}]}'] as const : path === '/workspace' ? JSON.stringify({ token }) : '{}';
      const production = await api(respond), staging = await api(respond); servers.splice(0, servers.length, production, staging);
      const document = join(shared, label + '.json');
      writeFileSync(document, JSON.stringify({ openapi: '3.0.3', info: { title: label, version: '1' }, servers: [{ url: production.url }, { url: staging.url }], security: [{ Session: [] }],
        paths: { '/code': { post: operation('requestCode') }, '/login': { post: operation('completeLogin') }, '/workspace': { post: operation('chooseWorkspace') }, [`/${label}`]: { get: operation('lookup', false) } },
        components: { securitySchemes: { Session: { type: 'http', scheme: 'bearer', 'x-access': { $ref: '#/components/x-access/session' } } }, 'x-access': { session: flow } } }));
      const sender = join(shared, label + '-source'), entry = join(installed, 'dist/src/index.js');
      ok(text(await call(entry, senderEnv, 'place', { dir: sender, name: label + '-owner' }, person, [shared])).includes('head/born'));
      const connected = await call(entry, senderEnv, 'connect', { place: aliases(sender), source: label, document }, person, [shared]);
      ok(text(connected).includes('head/connected'), text(connected).slice(0, 2500));
      const senderRoot = facts(sender).find(row => row.scope === 'keys/root' && row.measure === 'public-key')?.value;
      const senderSecret = senderKeys.held(`place/${label}-owner/root`, homeServices('@lapxo/head', senderEnv.HEAD_HOME).primary);
      ok(senderSecret && publicOf(senderSecret) === senderRoot, 'different name/folder resolves the authenticated root account');
      const recipe = { id: label + '-desk', revision: '1.0.0', title: label, description: 'Neutral access fixture', author: { name: 'Neutral fixture author' },  };
      const artifact = join(shared, label + '.mcpb'); const exported = await call(entry, senderEnv, 'share', { place: aliases(sender), to: artifact, args: JSON.stringify(recipe) }, undefined, [shared]);
      ok(text(exported).includes('head/bundle-shared'), text(exported).slice(0, 2500));
      const received = join(scratch, label + '-installed'); execFileSync('unzip', ['-q', artifact, '-d', received]); const receivedEntry = join(received, 'dist/src/index.js');
      const ready = await call(receivedEntry, receiverEnv, 'ask', {}); const cell = ready.result?.structuredContent?.cells?.find((c: any) => c.code === 'head/bundle-receiver-ready');
      ok(cell, text(ready).slice(0, 2500)); const beforeCalls = production.seen.length + staging.seen.length; events.length = 0;
      const accepted = await call(receivedEntry, receiverEnv, 'connect', cell.next.args, person);
      const associated = accepted.result?.structuredContent?.cells?.find((c: any) => c.code === 'head/bundle-associated'); ok(associated, text(accepted).slice(0, 3500));
      deepStrictEqual(events, ['yes']); deepStrictEqual(production.seen.length + staging.seen.length, beforeCalls);
      const place = associated.fields.place, before = snapshot(place); ok(before.rootAccountPublicMatches && before.head && before.person, JSON.stringify(before));
      const afterRestart = await call(receivedEntry, receiverEnv, 'ask', {}); ok(!text(afterRestart).includes('head/bundle-receiver-ready'));
      deepStrictEqual(snapshot(place), before, 'restart retains admitted person/device/root identities and coverages');
      let wrongPrompts = 0;
      const wrongBeforeChoice = { ...fakeKeychain({}).env, HEAD_HOME: receiverEnv.HEAD_HOME, HOME: personal };
      const noIdentity = await call(receivedEntry, wrongBeforeChoice, 'access', { place: aliases(place), source: label, operation: 'lookup' }, () => { wrongPrompts++; return { action: 'decline' }; });
      ok(text(noIdentity).includes('head/home-refused'), text(noIdentity).slice(0, 3000));
      deepStrictEqual(wrongPrompts, 0); deepStrictEqual(production.seen.length + staging.seen.length, beforeCalls);
      events.length = 0; const accessed = await call(receivedEntry, receiverEnv, 'access', { place: aliases(place), source: label, operation: 'lookup' }, person);
      ok(text(accessed).includes('head/access-kept') && !text(accessed).includes('head/not-covered'), text(accessed).slice(0, 3500));
      deepStrictEqual(events, ['origin', 'email', 'otp', 'workspaceId'], label + ': each place requires its own login');
      const returnedCard = accessed.result?.structuredContent?.cells?.find((c: any) => c.code === 'head/card')?.fields.card;
      const currentCard = (await call(receivedEntry, receiverEnv, 'ask', { place, card: 'true' })).result?.structuredContent?.cells?.find((c: any) => c.code === 'head/card')?.fields.card;
      ok(returnedCard && returnedCard === currentCard, 'access returns the card after origin selection, including aliases');
      deepStrictEqual(production.seen.length, 0); deepStrictEqual(staging.seen.map(r => r.url), ['/code', '/login', '/workspace']);
      const own = facts(place), pinned = own.find(row => row.scope === `uses/${label}`)!;
      const interpreted = readFileSync(join(place, pinned.needs!), 'utf8').split('\n').map(line => parse(line)).flatMap(p => p.kind === 'fact' ? [p.value.fields] : []);
      const plan = planRead([...own, ...interpreted], lockAt(installed), label, 'lookup', basename(place)); ok(plan.kind === 'call');
      ok(plan.access.account && opened(receiverKeys.bound(plan.access.account, homeServices('@lapxo/head', receiverEnv.HEAD_HOME).primary))?.secret === token, 'each place retains its own issuer credential');
      const receiptScope = `access/${plan.access.flow}/obtained`;
      const evidence = run('@lapxo/bound', place, ['fold', '--as', 'evidence']); ok(evidence?.code === 0, evidence?.err.join('\n'));
      const receipt = evidence.out.map(line => parse(line)).flatMap(p => p.kind === 'fact' ? [p.value.fields] : []).find(row => row.by === 'head' && row.scope === receiptScope && row.value === 'present');
      ok(receipt, 'successful access has its own authenticated native receipt');
      ok(!evidence.out.join('\n').includes(token), 'credential is absent from native evidence');
      const after = snapshot(place); deepStrictEqual(after, before);
      const reused = await call(receivedEntry, receiverEnv, 'access', { place: aliases(place), source: label, operation: 'lookup' }, person); ok(text(reused).includes('head/access-kept')); deepStrictEqual(staging.seen.length, 3);
      const falseKeys = { ...fakeKeychain({}).env, HEAD_HOME: receiverEnv.HEAD_HOME, HOME: personal }; let asked = 0;
      const rejected = await call(receivedEntry, falseKeys, 'access', { place: aliases(place), source: label, operation: 'lookup' }, () => { asked++; return { action: 'decline' }; });
      ok(!text(rejected).includes('head/access-kept') && asked === 0); deepStrictEqual(staging.seen.length, 3); deepStrictEqual(snapshot(place), before);
      const publishedAnswers = calls.slice(start).map(c => JSON.stringify(c)).join('\n'); ok(!publishedAnswers.includes(token));
      const held = await call(receivedEntry, receiverEnv, 'ask', { place });
      const placeCell = held.result?.structuredContent?.cells?.find((c: any) => c.code === 'head/place-held');
      domains.push({ domain: label, lexicalAliasCalls: pathAliases, returnedCardFresh: true, credentialMatchesOwnIssuer: true, importConsentCount: 1, importCalls: beforeCalls, restartedWithSameKeychain: true, admittedKeysUnchanged: true, rootAccountPublicMatches: true, senderDifferentNameAndFolderAuthenticated: true, accessOrder: ['origin', 'email', 'otp', 'workspaceId'], selectedServerOnly: true, loginCalls: 3, accessReceiptObserved: true, accessReceiptScope: receipt.scope, accessReceiptKey: receipt.by, credentialReusedAcrossProcesses: true, freshWrongKeychainRefused: true, wrongKeychainBlockedBeforeAuthority: true, credentialCanaryAbsentFromAnswers: true, credentialCanaryAbsentFromEvidence: true, localName: before.localName, associationPackageName: associated.fields.package, associatedPlaceAndListedDirectoryAgree: placeCell?.fields?.dir === place, packageNameIsNotPlaceName: associated.fields.package !== before.localName, consistentLocalPlaceName: associated.fields.name === before.localName });
      await production.close(); await staging.close(); servers.splice(0);
    }
    return { node: process.versions.node, domains, calls, pathAliases, persistentKeychain:true, realAccountsUsed:false, coverageWidened:false, productModified:false };
  } finally {
    for (const server of servers) await server.close();
    if (prior === undefined) delete process.env['HEAD_ENTRY']; else process.env['HEAD_ENTRY'] = prior;
    rmSync(scratch, { recursive: true, force: true });
  }
}
