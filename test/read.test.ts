import { test } from 'node:test';
import { deepStrictEqual, match, ok } from 'node:assert';
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical } from '@lapxo/topos/wire';
import { run } from './cli.ts';
import { ask } from './client.ts';
import { api, born, line, said, text, viewOf } from './place.ts';

const issues = JSON.stringify([{ number: 1, title: 'stale', state: 'open' }]);
const server = () => api((url) => (url.endsWith('/issues/2') ? 'x'.repeat(4096) : issues));

const look = (place: string, operation: string, args: Record<string, string>, at = '8') => ({ method: 'tools/call', params: { name: 'look', arguments: { place, source: 'tracker', operation, args, at } } });

test('an offer of class read is made once with the person-s token, its digest lands as a receipt, no untyped body comes back, and the same request again is answered from it without a call', async () => {
  const api = await server();
  const { place, keychain } = born(api.url, [canonical({ at: 'policy:fixture', by: 'target', form: 'interval', measure: 'seconds', role: 'writes', scope: 'allow/reuse/tracker', value: '0..3600' })]);
  const [first, second] = await ask([look(place, 'issues/list-for-repo', { owner: 'lapxo', repo: 'demo' }), look(place, 'issues/list-for-repo', { owner: 'lapxo', repo: 'demo' })], [], keychain.env);
  await api.close();
  const receipt = text(first).split('\n').filter((l) => !l.startsWith('red:')).at(-1)!;
  match(text(first), said('untyped')); ok(!text(first).includes('stale'), 'no body reaches the model where no world types it');
  deepStrictEqual(api.seen.map((one) => [one.headers['authorization'], one.headers['connection'] === 'close']), [['Bearer token-for-tests', false]], 'a pooled connection: head no longer blocks while bound folds');
  match(receipt, / by=head .* scope=read\/tracker\/issues\/list-for-repo\/[0-9a-f]{16} sig=/);
  ok(viewOf(place, 'evidence').split('\n').includes(receipt), 'the receipt is authenticated evidence'); ok(!viewOf(place, 'lines').includes(receipt), 'and never the place-s policy');
  match(text(second), said('reread')); deepStrictEqual(api.seen.length, 1);
  ok(!keychain.argv().includes('token-for-tests'));
});

test('no: an act bound refuses to fold is a refusal, never an empty standing — nothing is called, planned or landed on it', async () => {
  const api = await server();
  const { place, root, keychain } = born(api.url);
  const lot = join(mkdtempSync(join(tmpdir(), 'head-act-')), 'lot.bound');
  writeFileSync(lot, `${line('allow/history/tracker', 'status', 'present')}\n`);
  deepStrictEqual(run('@lapxo/bound', place, ['land', lot, '--key-file', root])?.code, 0);
  const act = readdirSync(join(place, '.bound', 'ledger', 'acts')).find((f) => f.startsWith('committed-'))!;
  appendFileSync(join(place, '.bound', 'ledger', 'acts', act, 'records.bound'), 'bound-lock/1 scope=read/tracker value\n');
  const plan = { method: 'tools/call', params: { name: 'plan', arguments: { place, lines: canonical({ at: 'policy:person/asks', by: 'target', form: 'alphabet', measure: 'status', role: 'writes', scope: 'ask/tracker/issues/create', value: 'present' }) } } };
  const [read, planned] = await ask([look(place, 'issues/list-for-repo', { owner: 'lapxo', repo: 'demo' }), plan], [], keychain.env, () => ({ action: 'accept', content: { yes: true } }));
  await api.close();
  match(text(read), said('unsettled')); match(text(read), /REFUSE/); match(text(planned), said('unfolded'));
  deepStrictEqual(api.seen.length, 0);
});

test('no: a place whose land prints no act result is never landed in — refused by name before anything is called, and its ledger is unchanged', async () => {
  const api = await server();
  const { place, keychain } = born(api.url, [line('view/evidence', 'id', 'evidence', { role: 'demands' })], 'token-for-tests', true, 'tracker', true, false);
  const before = viewOf(place, 'evidence');
  ok(/ scope=keys\/root /.test(before), 'the place has evidence to compare');
  const [read] = await ask([look(place, 'issues/list-for-repo', { owner: 'lapxo', repo: 'demo' })], [], keychain.env);
  await api.close();
  match(text(read), said('unsettled')); match(text(read), /REFUSE·act the place declares no wire\/act-result/);
  deepStrictEqual([api.seen.length, viewOf(place, 'evidence')], [0, before]);
});

test('no: an offer not of class read is listed and never called; nor is anything whose secret was never entered, with no origin picked among several, or past the rate', async () => {
  const api = await server();
  const quiet = born(api.url, [canonical({ at: 'policy:fixture', by: 'target', form: 'interval', measure: 'calls-per-hour', role: 'reads', scope: 'read/rate', value: '0..1' })]);
  const keychain = quiet.keychain;
  const [write, unknown, first, spent] = await ask([
    look(quiet.place, 'issues/create', { owner: 'lapxo', repo: 'demo' }), look(quiet.place, 'issues/nope', {}),
    look(quiet.place, 'issues/get', { owner: 'lapxo', repo: 'demo', issue_number: '1' }), look(quiet.place, 'issues/get', { owner: 'lapxo', repo: 'demo', issue_number: '3' }),
  ], [], keychain.env);
  const unpicked = born(undefined);
  const [noOrigin] = await ask([look(unpicked.place, 'issues/get', { owner: 'lapxo', repo: 'demo', issue_number: '1' })], [], unpicked.keychain.env);
  const tokenless = born(api.url, [], null);
  const [noToken] = await ask([look(tokenless.place, 'issues/get', { owner: 'lapxo', repo: 'demo', issue_number: '1' })], [], tokenless.keychain.env);
  await api.close();
  match(text(write), said('not-callable')); match(text(unknown), said('unknown-operation')); match(text(spent), said('rate'));
  match(text(noOrigin), said('pick-origin')); match(text(noOrigin), /https:\/\/tracker\.example/); match(text(noToken), said('secret-unallowed'));
  deepStrictEqual([said('untyped').test(text(first)), api.seen.length], [true, 1]);
});

test('no: access is proven only the way the source declares it — an undeclared scheme is refused by name, and an anonymous offer carries no secret', async () => {
  const api = await server();
  const { place, keychain } = born(api.url);
  const [undeclared, anonymous] = await ask([look(place, 'digest', {}), look(place, 'status', {})], [], keychain.env);
  await api.close();
  match(text(undeclared), said('no-adapter'));
  deepStrictEqual([said('untyped').test(text(anonymous)), api.seen.map((one) => [one.url, one.headers['authorization']])], [true, [['/status', undefined]]]);
});

test('no: an origin that is neither encrypted nor this device is never sent anything', async () => {
  const { place, keychain } = born('http://tracker.example');
  const [plain] = await ask([look(place, 'issues/get', { owner: 'lapxo', repo: 'demo', issue_number: '1' })], [], keychain.env);
  match(text(plain), said('insecure-origin'));
});

test('look at a source answers typed lines by resolution: where it is reached and each class at 0, forms and access at 1, and never what only a transport reads', async () => {
  const { place, keychain } = born(undefined);
  const source = (at?: string) => ({ method: 'tools/call', params: { name: 'look', arguments: { place, source: 'tracker', ...(at ? { at } : {}) } } });
  const [zero, one, offer] = await ask([source('0'), source(), look(place, 'issues/get', {}, '1')], [], keychain.env);
  const scopes = (answer: any) => text(answer).split('\n').map((l) => /scope=(\S+) /.exec(l)?.[1] ?? '');
  ok(scopes(zero).includes('offers/tracker/issues/get') && !scopes(zero).some((s) => s.endsWith('/form')) && !text(zero).includes('measure=access'));
  ok(scopes(one).includes('offers/tracker/issues/get/form') && text(one).includes('measure=access') && scopes(one).includes('keys/access/tracker/token'));
  ok([zero, one, offer].every((answer) => !scopes(answer).some((s) => s.endsWith('/carry'))));
  ok(scopes(offer).every((s) => s === '' || s.startsWith('offers/tracker/issues/get') || s.startsWith('keys/access/tracker/') || s === 'region/tracker'));
});

test('no: a response past read/response-bytes is refused whole and nothing lands', async () => {
  const api = await server();
  const { place, keychain } = born(api.url, [canonical({ at: 'policy:fixture', by: 'target', form: 'interval', measure: 'bytes', role: 'reads', scope: 'read/response-bytes', value: '0..1024' })]);
  const before = readFileSync(join(place, 'TARGET.bound'), 'utf8');
  const [big] = await ask([look(place, 'issues/get', { owner: 'lapxo', repo: 'demo', issue_number: '2' })], [], keychain.env);
  await api.close();
  match(text(big), said('too-large'));
  deepStrictEqual(readFileSync(join(place, 'TARGET.bound'), 'utf8'), before);
});
