import { test } from 'node:test';
import { deepStrictEqual, doesNotMatch, match, ok } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical } from '@lapxo/topos/wire';
import { run } from './cli.ts';
import { ask } from './client.ts';
import { api, born, line, said, text } from './place.ts';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const look = (place: string) => ({ method: 'tools/call', params: { name: 'look', arguments: { place, source: 'tracker', operation: 'issues/list-for-repo', args: { owner: 'lapxo', repo: 'demo' }, at: '8' } } });
const widen = (place: string) => tool('plan', { place, lines: canonical({ at: 'policy:person/asks', by: 'target', form: 'alphabet', measure: 'status', role: 'writes', scope: 'ask/tracker/issues/create', value: 'present' }) });

test('no: a lock is no source — adopting another place-s lock as a parent is refused by name before anything is asked, and nothing lands', async () => {
  const server = await api(() => '[]');
  try {
    const [org, member] = [born(server.url), born(server.url)];
    const asked: string[] = [];
    const before = readFileSync(join(member.place, 'TARGET.bound'), 'utf8');
    const [adopted] = await ask([tool('connect', { place: member.place, source: 'org', document: join(org.place, 'TARGET.bound') })], [org.place], member.keychain.env, (params) => { asked.push(params.message); return { action: 'accept', content: { yes: true } }; });
    match(text(adopted), said('parent-lock')); deepStrictEqual(asked, []);
    deepStrictEqual(readFileSync(join(member.place, 'TARGET.bound'), 'utf8'), before);
  } finally { await server.close(); }
});

test('no: a place that pins a lock as its parent is never read or signed for with the parent dropped — each is refused by name, nothing called', async () => {
  const server = await api(() => '[]');
  try {
    const { place, root, keychain } = born(server.url);
    const parent = join(place, '.head', 'adopted', 'org.bound');
    mkdirSync(join(place, '.head', 'adopted'), { recursive: true });
    writeFileSync(parent, `${[line('region/org', 'reads', 'allow/**', { role: 'reads' }), line('allow/read', 'sources', 'none')].join('\n')}\n`);
    const folded = run('@lapxo/bound', place, ['fold', parent])?.out ?? [];
    const pin = folded.find((l) => l.startsWith('PIN '))?.slice('PIN '.length) ?? '';
    writeFileSync(parent, folded.filter((l) => l.startsWith('TOPOS ')).map((l) => `${l.slice('TOPOS '.length)}\n`).join(''));
    const lot = join(mkdtempSync(join(tmpdir(), 'head-parent-')), 'lot.bound');
    writeFileSync(lot, `${line('uses/org', 'digest', pin, { needs: '.head/adopted/org.bound' })}\n`);
    deepStrictEqual(run('@lapxo/bound', place, ['land', lot, '--key-file', root])?.code, 0);
    const [read, planned] = await ask([look(place), widen(place)], [], keychain.env, () => ({ action: 'accept', content: { yes: true } }));
    match(text(read), said('parent-lock')); match(text(planned), said('parent-lock'));
    doesNotMatch(text(planned), /Lot sha256:/); ok(server.seen.length === 0, 'nothing was called');
  } finally { await server.close(); }
});
