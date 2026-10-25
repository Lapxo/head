import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aboutOf, valueOf } from '../src/core/lock.ts';
import { fill } from '../src/core/surface.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { api, born, lock, root, viewOf } from './place.ts';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const codes = (answer: any): string[] => answer.result.structuredContent.cells.map((c: any) => c.code).filter((c: string) => !['head/card', 'head/red'].includes(c));
const family = valueOf(lock, 'claim/family');
/** What a place keeps as the person's: each statement that stands in its evidence, in their words — an attestation of what they said, never the place's policy. */
const kept = (place: string): readonly string[] => ((lines) => lines.filter((l) => new RegExp(` scope=${family}/[0-9a-f]{16}/\\d+ `).test(l) && !lines.some((w) => w.includes(` scope=${/ scope=(\S+)/.exec(l)![1]}/${valueOf(lock, 'claim/withdrawn')} `))).map((l) => /about="([^"]*)"/.exec(l)?.[1] ?? '').sort())(viewOf(place, 'evidence').split('\n'));
/** A person's home with two places of theirs, founded by head; what they are asked, kept; their answer to it, as the test says. */
const person = async () => {
  const mine = mkdtempSync(join(tmpdir(), 'head-claims-')), env = { ...fakeKeychain({}).env, HEAD_HOME: join(mine, 'home') }, [a, b] = [join(mine, 'garden'), join(mine, 'trips')], asked: string[] = [];
  const answering = (answer: boolean) => (params: any) => { asked.push(params.message); return answer ? { action: 'accept', content: { yes: true } } : { action: 'decline' }; };
  await ask([tool('place', { dir: a }), tool('place', { dir: b })], [], env, answering(true));
  asked.length = 0;
  return { a, b, asked, say: (calls: readonly any[], answer = true) => ask(calls, [], env, answering(answer)) };
};

test('yes, over two places: what the person states is kept as theirs, signed, in their words — asked once a place in the conversation, each said back as it goes in', async () => {
  const p = await person();
  const answers = await p.say([tool('claim', { place: p.a, said: 'I water the roses on Sundays' }), tool('claim', { place: p.a, said: 'The soil is clay' }), tool('claim', { place: p.b, said: 'I travel in March' })]);
  deepStrictEqual(answers.map(codes), [['head/claimed'], ['head/claimed'], ['head/claimed']]);
  deepStrictEqual(p.asked, [p.a, p.b].map((place) => fill(aboutOf(lock, 'said/elicit-claims'), { place })), 'asked once a place, in the lock-s words');
  deepStrictEqual([kept(p.a), kept(p.b)], [['I water the roses on Sundays', 'The soil is clay'], ['I travel in March']]);
  ok(answers[0].result.structuredContent.cells[0].fields.said === 'I water the roses on Sundays', 'said back as it went in, word for word');
  ok(viewOf(p.a, 'evidence').split('\n').filter((l) => l.includes(` scope=${family}/`)).every((l) => l.includes(` ${valueOf(lock, 'claim/via')}=test@0`)), 'each carries who brought it, as its witness: the client, as it says it is');
});

test('no: a person who says no has nothing kept, and is not asked again in that conversation; a new conversation asks again', async () => {
  const p = await person();
  const declined = await p.say([tool('claim', { place: p.a, said: 'I water the roses on Sundays' }), tool('claim', { place: p.a, said: 'The soil is clay' })], false);
  deepStrictEqual([declined.map(codes), p.asked.length, kept(p.a)], [[['head/claims-declined'], ['head/claims-declined']], 1, []]);
  const later = await p.say([tool('claim', { place: p.a, said: 'The soil is clay' })]);
  deepStrictEqual([codes(later[0]), p.asked.length, kept(p.a)], [['head/claimed'], 2, ['The soil is clay']]);
});

test('withdraw: the same words take back what was kept of them, by attesting that beside it, and the place still folds; words never kept take nothing back; what was taken back may be stated again', async () => {
  const p = await person();
  const [, taken, none] = await p.say([tool('claim', { place: p.a, said: 'The soil is clay' }), tool('claim', { place: p.a, said: 'The soil is clay', withdraw: 'true' }), tool('claim', { place: p.a, said: 'The soil is sand', withdraw: 'true' })]);
  deepStrictEqual([codes(taken), codes(none), kept(p.a)], [['head/unclaimed'], ['head/claim-none'], []], 'taken back, and the place still folds');
  const [again] = await p.say([tool('claim', { place: p.a, said: 'The soil is clay' })]);
  deepStrictEqual([codes(again), kept(p.a)], [['head/claimed'], ['The soil is clay']], 'what was taken back may be stated again');
});

test('no: nothing the model concluded becomes the person-s — only the claim action keeps a statement, and only it and the claims view read the family it is kept under', () => {
  const files = (dir: string): readonly string[] => readdirSync(join(root, dir)).flatMap((n) => (statSync(join(root, dir, n)).isDirectory() ? files(`${dir}/${n}`) : n.endsWith('.ts') ? [`${dir}/${n}`] : []));
  const reading = files('src').filter((f) => readFileSync(join(root, f), 'utf8').includes("'claim/family'"));
  const importing = files('src').filter((f) => readFileSync(join(root, f), 'utf8').includes('claims/claim.ts'));
  deepStrictEqual([reading, importing], [['src/claims/claim.ts', 'src/claims/view.ts'], ['src/tools/claim.ts']]);
});

test('no: a place whose lines admit no field for who carried a statement keeps nothing, and is handed the line that admits it, for its root to sign', async () => {
  const server = await api();
  try {
    const { place, keychain } = born(server.url);
    const [refused] = await ask([tool('claim', { place, said: 'The soil is clay' })], [], keychain.env, () => ({ action: 'accept', content: { yes: true } }));
    const cell = refused.result.structuredContent.cells.find((c: any) => c.code === 'head/claims-unadmitted');
    ok(cell && cell.next.tool === 'ask' && new RegExp(` scope=wire/fields value=\\S*\\|${valueOf(lock, 'claim/via')}`).test(cell.fields.lines) && kept(place).length === 0, JSON.stringify(refused.result.structuredContent.cells));
  } finally { await server.close(); }
});
