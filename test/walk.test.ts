import { test } from 'node:test';
import { deepStrictEqual, match, notStrictEqual, ok } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { canonical, parse } from '@lapxo/topos/wire';
import { run } from './cli.ts';
import { registryFor } from '../src/ports/signers.ts';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { said, text, viewOf } from './place.ts';

const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const yes = (params: any) => ({ action: 'accept', content: params.requestedSchema?.properties?.yes ? { yes: true } : {} });
const row = (scope: string, measure: string, value: string, more: Record<string, string> = {}) => canonical({ at: 'policy:fixture', by: 'target', form: 'alphabet', measure, role: 'writes', scope, value, ...more });
const facts = (lines: readonly string[] = []) => lines.filter((l) => parse(l).kind === 'fact');

test('every place head founds can be walked by bound: an organisation and a member, paired by their contexts, exchange only what differs — the member lands the organisation-s policy with a receipt it signs, once, and refuses it altered', async () => {
  const shared = mkdtempSync(join(tmpdir(), 'head-walk-'));
  const places = await Promise.all(['org', 'member'].map(async (name) => {
    const keychain = fakeKeychain({}), home = join(shared, `${name}-home`), dir = join(shared, name);
    const [born] = await ask([tool('place', { dir })], [], { ...keychain.env, HEAD_HOME: home }, yes);
    match(text(born), said('born'));
    return { name, dir, env: { ...keychain.env, BOUND_SIGNERS: registryFor('keychain', `@lapxo/head/${basename(home)}`, `place/${name}/root`, 'root', 'ed25519:era1', 'keychain') } };
  }));
  const bound = (p: (typeof places)[number], args: readonly string[]) => run('@lapxo/bound', p.dir, [...args], p.env);
  const lot = (name: string, lines: readonly string[]) => ((at) => { writeFileSync(at, `${lines.join('\n')}\n`); return at; })(join(shared, `${name}.bound`));
  const signed = ['--key', 'root', '--signer', 'keychain'];
  const pins = places.map((p) => {
    const lock = readFileSync(join(p.dir, 'TARGET.bound'), 'utf8');
    for (const scope of ['wire/walk/contract', 'view/walk', 'view/evidence', 'walk/origin']) ok(lock.includes(` scope=${scope} `), `${p.name} was born without ${scope}`);
    const pin = / scope=walk\/context .*value=(sha256:[0-9a-f]+)/.exec(lock)?.[1] ?? '';
    deepStrictEqual(`sha256:${createHash('sha256').update(readFileSync(join(p.dir, '.head', 'walk', 'context.bound'))).digest('hex')}`, pin, 'the context laid beside the lock is the one pinned');
    return pin;
  });
  places.forEach((p, i) => {
    const other = places[1 - i]!;
    writeFileSync(join(p.dir, '.head', 'walk', `${other.name}.bound`), readFileSync(join(other.dir, '.head', 'walk', 'context.bound')));
    deepStrictEqual(bound(p, ['land', lot(`${p.name}-pair`, [row(`uses/peer-${other.name}`, 'digest', pins[1 - i]!, { needs: `.head/walk/${other.name}.bound` })]), ...signed])?.code, 0);
  });
  const [org, member] = places as [(typeof places)[0], (typeof places)[0]];
  deepStrictEqual(bound(org, ['land', lot('grant', [row('allow/read', 'sources', 'jobs|people'), row('allow/read', 'until', '2999-01-01')]), ...signed])?.code, 0);
  const inventory = lot('member-inventory', facts(bound(member, ['fold', '--as', 'walk@0', ...signed])?.out));
  const summary = bound(org, ['fold', '--as', 'walk@1', inventory, ...signed]);
  ok(!facts(summary?.out).some((l) => / scope=allow\//.test(l)), 'a summary names regions, never their history');
  const packet = bound(org, ['fold', '--as', 'walk@8', inventory, ...signed]);
  match((packet?.out ?? []).join('\n'), /EXCHANGE [1-9]\d* touched regions · [1-9]\d* open regions · \d+ payload bytes/);
  const payload = lot('org-payload', facts(packet?.out));
  const altered = lot('altered', facts(packet?.out).map((l) => l.replace('value=jobs|people', 'value=jobs|people|payroll')));
  notStrictEqual(bound(member, ['land', altered, ...signed])?.code, 0, 'an altered payload is refused');
  const landed = bound(member, ['land', payload, ...signed]);
  match((landed?.out ?? []).join('\n'), /INGRESS [1-9]\d* new evidence lines · 1 signed local import receipt/);
  match((bound(member, ['land', payload, ...signed])?.out ?? []).join('\n'), /ONCE 0 new evidence lines · 1 retained import receipt/);
  const evidence = facts(bound(member, ['fold', '--as', 'evidence'])?.out);
  ok(evidence.some((l) => / scope=allow\/read /.test(l) && / value=jobs\|people$/.test(l)), 'the member holds the organisation-s grant as authenticated evidence');
  ok(!viewOf(member.dir, 'lines').includes('value=jobs|people'), 'foreign history never enters the member-s own standing');
});
