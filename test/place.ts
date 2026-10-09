import { deepStrictEqual } from 'node:assert';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, parse } from '@lapxo/topos/wire';
import { admissionOf } from '../src/core/device.ts';
import { newKey } from '../src/core/keys.ts';
import { run } from './cli.ts';
import { lockAt } from '../src/ports/place.ts';
import { fakeKeychain } from './fake-keychain.ts';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const lock = lockAt(root);
/** The place the world compiled, laid as a fixture would be: the same lines, drafted by the fixture's target. */
const world = ((v) => ({ lines: v.lines.map((l) => ((got) => (got.kind === 'fact' ? canonical({ ...got.value.fields, by: 'target', at: 'policy:fixture' }) : l))(parse(l))) }))(JSON.parse(readFileSync(join(root, 'vectors/tracker.json'), 'utf8')) as { lines: string[] });
export const line = (scope: string, measure: string, value: string, more: Record<string, string> = {}) => canonical({ at: 'policy:fixture', by: 'target', form: 'alphabet', measure, role: 'writes', scope, value, ...more });

/**
 * The wire this test place declares as its own configuration before anything lands in it: the base topos publishes, the
 * words bound reads by name, the local journals and the signer limits. Nothing in head requires a place to carry them.
 */
export const PLACE_WIRE: readonly (readonly [string, string, string?])[] = [
  ['wire/fields', 'scope|role|form|measure|value|by|at|needs|sig|epoch|shape|restsOn|condition|about|kind|view'], ['wire/required', 'scope|role|form|measure|value|by|at'],
  ['wire/forms', 'interval|alphabet|ladder'], ['wire/roles', 'reads|writes|demands|source|render|receipt'], ['wire/at-classes', 'origin|place|receipt|witness|policy'],
  ['wire/form/at', 'class'], ['wire/form/epoch', 'count'], ['wire/form/sig', 'signature'], ['wire/form/needs', 'region'],
  ['wire/families', 'audit|beat|block|cites|comments|concept|cost|dep|effect|fold|hazard|keys|law|license|lines|literal|offers|question|reader|region|release|render|roles|sample|session|take|test|tree|vector|view|write'],
  ['wire/states', 'absent|present|unread|withdraw'], ['wire/shapes', 'decision|lock|package|reader|render|run|vector|view'], ['wire/templates', '{cone}|{roots}'],
  ['wire/digest-algorithms', 'sha256'], ['wire/signature-algorithms', 'ed25519:era1'], ['wire/era', 'era1'], ['wire/region-measures', 'coordinates'],
  ['keys/reader', 'read'], ['keys/fold', 'fold'], ['signer/timeout', '30000..30000', 'interval'], ['signer/response-bytes', '1048576..1048576', 'interval'],
];

/** What a place head founds declares beside its wire, so every lot is one act whose result land prints, and its evidence and acts are views bound answers. */
export const profile = (name: string) => [line('wire/act-result', 'id', 'local-act@1'), line('wire/act-result-scope', 'id', 'receipt/act'), line('wire/act-result-context', 'id', `place:${name}`),
  line('view/act', 'id', 'act', { role: 'demands' }), line('view/evidence', 'id', 'evidence', { role: 'demands' })];
/** A view of a place as the installed bound folds it, its lines joined: what a test reads instead of any journal. */
export const viewOf = (place: string, view: 'lines' | 'evidence') => (run('@lapxo/bound', place, ['fold', '--as', view])?.out ?? []).filter((l) => l.startsWith('bound-lock/1')).join('\n');

/** An API that answers fixed bytes and keeps every request it was sent: method, path, headers and body; one it drops never answers. */
export const api = async (answer: (url: string, body: string) => string | readonly [number, string] = () => '[]', drop: (method: string, count: number) => boolean = () => false) => {
  const seen: { method?: string; url?: string; headers: Record<string, unknown>; body: string }[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => { seen.push({ method: request.method, url: request.url, headers: request.headers, body }); if (drop(request.method ?? '', seen.length)) { request.socket.destroy(); return; } ((got) => { response.writeHead(typeof got === 'string' ? 200 : got[0], { 'content-type': 'application/json' }); response.end(typeof got === 'string' ? got : got[1]); })(answer(request.url ?? '', body)); });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
};

/** A place born from nothing: a fixture root, head-s and the person-s keys admitted, the place topos-openapi compiled of the demo tracker, the origin the person picked, and a keychain holding both keys and the source's token. */
export const born = (server: string | undefined, extra: readonly string[] = [], token: string | null = 'token-for-tests', fixture = true, source = 'tracker', granted = true, acts = true) => {
  const place = mkdtempSync(join(tmpdir(), 'head-place-'));
  mkdirSync(join(place, '.bound'));
  const owner = generateKeyPairSync('ed25519');
  const pem = join(mkdtempSync(join(tmpdir(), 'head-root-')), 'root.pem');
  writeFileSync(pem, owner.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const [head, person] = [newKey(), newKey()];
  const prelude = PLACE_WIRE.map(([scope, value, form]) => line(scope, form === 'interval' ? (scope.endsWith('timeout') ? 'milliseconds' : 'bytes') : 'id', value, form === 'interval' ? { form, role: 'writes' } : { role: scope.startsWith('keys/') ? 'writes' : 'reads', ...(scope.startsWith('keys/') ? { measure: 'class' } : {}) }));
  const overridden = (l: string) => extra.some((e) => e.includes(` scope=${/ scope=(\S+)/.exec(l)?.[1]} `) && e.includes(` measure=${/ measure=(\S+)/.exec(l)?.[1]} `));
  writeFileSync(join(place, 'TARGET.bound'), [
    line('keys/root', 'class', 'authorize'), line('keys/root', 'coverage', '*'), line('keys/root', 'signer', 'file'), line('keys/root', 'public-key', owner.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')),
    ...admissionOf(lock, head.publicKey, 'head'), ...admissionOf(lock, person.publicKey, 'person'), ...prelude, ...(acts ? profile(basename(place)) : []), ...(fixture ? world.lines.filter((l) => !overridden(l)) : []), ...extra,
    ...(server === undefined ? [] : [line(`allow/origin/${source}`, 'id', server)]),
    ...(granted ? [line('allow/read', 'sources', source), line('allow/read', 'until', '2999-01-01')] : []),
  ].join('\n') + '\n');
  const landed = run('@lapxo/bound', place, ['land', '--key-file', pem]);
  deepStrictEqual(landed?.code, 0, landed?.err.join('\n'));
  return { place, root: pem, keychain: fakeKeychain({ head: head.secret, person: person.secret, ...(token === null ? {} : { [`place/${basename(place)}/api/${source}`]: Buffer.from(JSON.stringify({ secret: token, at: '2026-01-01T00:00:00.000Z' })).toString('base64url') }) }) };
};

/** What head says for a key, as a pattern of its whole template: every field it fills may be anything, every word around them must stand. */
export const said = (key: string) => new RegExp(lock.find((l) => l.scope === `said/${key}`)!.about!.split(/\{\w+\}/).map((part) => part.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')).join('[\\s\\S]*?'));
export const text = (answer: any): string => answer.result?.content?.[0]?.text ?? JSON.stringify(answer.error ?? answer);
