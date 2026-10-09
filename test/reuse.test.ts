import { test } from 'node:test';
import { deepStrictEqual, doesNotMatch, match, ok } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, join } from 'node:path';
import { run } from './cli.ts';
import { ask } from './client.ts';
import { api, born, line, said, text } from './place.ts';

const look = (place: string) => ({ method: 'tools/call', params: { name: 'look', arguments: { place, source: 'tracker', operation: 'issues/list-for-repo', args: { owner: 'lapxo', repo: 'demo' }, at: '8' } } });
const sealed = (secret: string, at: string) => Buffer.from(JSON.stringify({ secret, at })).toString('base64url');
const digestIn = (answer: unknown): string => / scope=read\/tracker\/\S+ .*value=sha256:([0-9a-f]{64})/.exec(text(answer))?.[1] ?? '';
const reusing = (seconds = '0..3600') => [line('allow/reuse/tracker', 'seconds', seconds, { form: 'interval' })];
const served = async (body: (server: Awaited<ReturnType<typeof api>>) => Promise<void>, answer = '[]') => { const server = await api(() => answer); try { await body(server); } finally { await server.close(); } };

test('no: what was read as one account is never answered to another — the token held now was obtained later, so the same request is called again with it', () => served(async (server) => {
  const { place, keychain } = born(server.url, reusing());
  const [first] = await ask([look(place)], [], keychain.env);
  writeFileSync(join(keychain.env.PATH.split(delimiter)[0]!, `held-ANY--place_${basename(place)}_api_tracker`), sealed('token-of-another', '2026-02-01T00:00:00.000Z'));
  const [second] = await ask([look(place)], [], keychain.env);
  match(text(first), said('untyped')); doesNotMatch(text(second), said('reread')); doesNotMatch(text(second), said('reused'));
  deepStrictEqual(server.seen.map((one) => one.headers['authorization']), ['Bearer token-for-tests', 'Bearer token-of-another']);
}));

test('no: a grant that no longer holds is not bypassed by what was kept under it — the person is asked again, and a no reads nothing', () => served(async (server) => {
  const { place, root, keychain } = born(server.url, reusing());
  const [first] = await ask([look(place)], [], keychain.env);
  const lot = join(mkdtempSync(join(tmpdir(), 'head-expiry-')), 'lot.bound');
  writeFileSync(lot, `${line('allow/read', 'until', '2000-01-01')}\n`);
  deepStrictEqual(run('@lapxo/bound', place, ['land', lot, '--key-file', root])?.code, 0);
  const [second] = await ask([look(place)], [], keychain.env, () => ({ action: 'decline' }));
  match(text(first), said('untyped')); doesNotMatch(text(second), said('reread')); doesNotMatch(text(second), said('reused'));
  deepStrictEqual(server.seen.length, 1);
}));

test('no: kept bytes that no longer hash to their receipt are never answered — the same request is called again', () => served(async (server) => {
  const { place, keychain } = born(server.url, reusing());
  const [first] = await ask([look(place)], [], keychain.env);
  writeFileSync(join(tmpdir(), 'head-reads', digestIn(first)), '200\n[{"title":"forged"}]');
  const [second] = await ask([look(place)], [], keychain.env);
  doesNotMatch(text(second), said('reread')); doesNotMatch(text(second), /forged/);
  deepStrictEqual(server.seen.length, 2);
}, `[{"kept":"${process.pid}-${Date.now()}"}]`));

const history = (place: string) => ({ method: 'tools/call', params: { name: 'look', arguments: { place, source: 'tracker', operation: 'issues/list-for-repo', args: { owner: 'lapxo', repo: 'demo' }, history: true } } });
const landing = (place: string, root: string, lines: readonly string[]) => {
  const lot = join(mkdtempSync(join(tmpdir(), 'head-lot-')), 'lot.bound');
  writeFileSync(lot, `${lines.join('\n')}\n`);
  deepStrictEqual(run('@lapxo/bound', place, ['land', lot, '--key-file', root])?.code, 0);
};

test('reuse is a permission the place declares: unchanged inputs within it are answered from what was kept; without it, or past it, or once it is withdrawn, the source is called', () => served(async (server) => {
  const [allowed, undeclared, stale] = [born(server.url, reusing()), born(server.url), born(server.url, reusing('0..0'))];
  for (const one of [allowed, undeclared, stale]) await ask([look(one.place), look(one.place)], [], one.keychain.env);
  deepStrictEqual(server.seen.length, 1 + 2 + 2, 'one call where reuse is allowed, two where it is not declared or the read is older than it allows');
  landing(allowed.place, allowed.root, [line('allow/reuse/tracker', 'seconds', 'withdraw', { form: 'interval' })]);
  const [after] = await ask([look(allowed.place)], [], allowed.keychain.env);
  doesNotMatch(text(after), said('reread')); deepStrictEqual(server.seen.length, 6, 'a withdrawn reuse is no reuse');
}));

test('history is its own permission, and never a current answer: refused by name with the line to sign; once allowed, it shows the read as of when it was made — after the grant to read has lapsed, without calling', () => served(async (server) => {
  const { place, root, keychain } = born(server.url, reusing());
  const [read, refused] = await ask([look(place), history(place)], [], keychain.env);
  const receipt = / scope=read\/tracker\/\S+ .*value=(sha256:[0-9a-f]{64})/.exec(text(read))?.[1] ?? '';
  match(text(refused), said('history-undeclared')); ok(text(refused).includes('scope=allow/history/tracker'));
  landing(place, root, [line('allow/history/tracker', 'status', 'present'), line('allow/read', 'until', '2000-01-01')]);
  const [shown, current] = await ask([history(place), look(place)], [], keychain.env, () => ({ action: 'decline' }));
  match(text(shown), said('history')); match(text(shown), said('history-untyped')); ok(text(shown).includes(receipt));
  doesNotMatch(text(shown), said('reread')); doesNotMatch(text(current), said('reread'));
  deepStrictEqual(server.seen.length, 1, 'history calls nothing, and a current read past its grant is asked, declined, and calls nothing');
}));

test('a duplicate receipt adds neither authority nor another origin: delivered again it lands once, and history shows one read; a later read is a second origin, shown as earlier', () => served(async (server) => {
  const { place, keychain } = born(server.url, [line('allow/history/tracker', 'status', 'present')]);
  const [read] = await ask([look(place)], [], keychain.env);
  const signed = text(read).split('\n').filter((l) => / by=head .*scope=read\/tracker\//.test(l));
  const again = join(mkdtempSync(join(tmpdir(), 'head-again-')), 'again.bound');
  writeFileSync(again, `${signed.join('\n')}\n`);
  match((run('@lapxo/bound', place, ['land', again])?.out ?? []).join('\n'), /^ONCE /m);
  const [once] = await ask([history(place)], [], keychain.env);
  doesNotMatch(text(once), said('history-earlier'));
  await ask([look(place)], [], keychain.env);
  const [twice] = await ask([history(place)], [], keychain.env);
  deepStrictEqual([server.seen.length, text(twice).split('\n').filter((l) => said('history-earlier').test(l)).length], [2, 1]);
}));

test('no: a retained answer is never an older snapshot than the newest read — reuse stands on the newest receipt of a request, not the first', async () => {
  let calls = 0;
  const tag = `${process.pid}-${Date.now()}`;
  const server = await api(() => `[{"tag":"${tag}","n":${++calls}}]`);
  try {
    const { place, keychain } = born(server.url, reusing());
    const [first] = await ask([look(place)], [], keychain.env);
    const older = digestIn(first);
    const kept = join(tmpdir(), 'head-reads', older);
    rmSync(kept);
    const [second] = await ask([look(place)], [], keychain.env);
    writeFileSync(kept, `200\n[{"tag":"${tag}","n":1}]`);
    const [third] = await ask([look(place)], [], keychain.env);
    match(text(third), said('reread')); ok(text(third).includes(digestIn(second)), 'answered from the newest read');
    ok(!text(third).includes(older), 'never from the first'); deepStrictEqual(calls, 2);
  } finally { await server.close(); }
});
