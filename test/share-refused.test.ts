import { test } from 'node:test';
import { deepStrictEqual, doesNotMatch, match, ok } from 'node:assert';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { valueOf } from '../src/core/lock.ts';
import { lock, said, text } from './place.ts';
import { tool, auth, jobs, digestOf, sender, receiver, receive, resaid, yes } from './share-fixture.ts';

const filesIn = (dir: string) => readdirSync(dir, { recursive: true, encoding: 'utf8' }).map((f) => join(dir, f)).filter((f) => statSync(f).isFile());
const secretsOf = (env: Record<string, string>) => filesIn(env['PATH']!.split(delimiter)[0]!).filter((f) => /\/held-/.test(f)).map((f) => readFileSync(f, 'utf8')).filter((s) => s.length >= 16);
const keysOf = (place: string) => readFileSync(join(place, 'TARGET.bound'), 'utf8').split('\n').filter((l) => / scope=keys\//.test(l)).map((l) => l.replace(/ (epoch|sig)=\S+/g, '')).sort();

test('no: a package is refused by name before anything is asked when its digest, a line no package carries, the world it was compiled under or the order its pins rest in is not as the package says — and nothing lands', async () => {
  const from = await sender(), to = await receiver(), before = readFileSync(join(to.place, 'TARGET.bound'), 'utf8');
  const refused = async (digest: string, name: string, also?: RegExp) => { const asked: string[] = []; const [got] = await receive(to, from.pkg, digest, asked, [from.shared]);
    match(text(got), said(name)); if (also) match(text(got), also); deepStrictEqual([asked, readFileSync(join(to.place, 'TARGET.bound'), 'utf8')], [[], before]); };
  await refused(digestOf('another package'), 'document-digest');
  const kept = readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8');
  await refused(resaid(from.pkg, (ls) => [...ls, ls[0]!.replace('scope=uses/topos-openapi', 'scope=allow/origin/org').replace(/value=\S+$/, 'value=https://org.example')]), 'package-line', /allow\/origin\/org/);
  writeFileSync(join(from.pkg, 'TARGET.bound'), kept);
  await refused(resaid(from.pkg, (ls) => ls.map((l) => (l.includes('scope=uses/topos-openapi') ? l.replace(/value=\S+$/, `value=${digestOf('another world')}`) : l))), 'package-world');
  writeFileSync(join(from.pkg, 'TARGET.bound'), kept);
  await refused(resaid(from.pkg, (ls) => ls.map((l) => l.replace('restsOn=uses/auth', 'restsOn=uses/payroll'))), 'package-line', /restsOn/);
  writeFileSync(join(from.pkg, 'TARGET.bound'), kept);
  ok(!existsSync(join(to.place, 'connected')), 'no byte was laid');
});

test('no: a pin the package names that this head does not compile is refused by name once every source is connected; and share writes only into a folder apart from what a place keeps — its own folders, compiled pins and walk context among them', async () => {
  const from = await sender(), to = await receiver(), asked: string[] = [];
  const line = readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8').split('\n').find((l) => l.includes(' scope=uses/jobs '))!, compiled = join(from.pkg, / needs=(\S+)/.exec(line)![1]!);
  writeFileSync(compiled, `${readFileSync(compiled, 'utf8')}bound-lock/1 at=place:openapi form=alphabet measure=class role=writes scope=offers/jobs/delete-everything value=callable\n`);
  const other = digestOf(readFileSync(compiled));
  const [got] = await receive(to, from.pkg, resaid(from.pkg, (ls) => ls.map((l) => (l === line ? l.replace(/value=\S+$/, `value=${other}`) : l))), asked, [from.shared]);
  match(text(got), said('package-pin')); match(text(got), new RegExp(`said/head/package-pin [^\\n]*source="jobs" pin="${other}" got="sha256:[0-9a-f]{64}"`)); doesNotMatch(text(got), said('received'));
  deepStrictEqual(asked.length, 1);
  for (const at of [from.place, join(from.place, 'connected'), join(from.place, '.head', 'out'), join(from.place, 'pins', 'out'), join(from.place, 'walk', 'out'), from.shared]) {
    const [refused] = await ask([tool('share', { place: from.place, to: at })], [from.shared], from.env);
    match(text(refused), said('share-to'));
  }
});

test('no: what makes a place someone-s never travels — a place with its root, its device keys, a member admitted and their secrets in the keychain shares no signer, root, admission or private byte; a package naming any of them, even under a source-s name, is refused by name; and one received installs no root and admits nothing', async () => {
  const from = await sender(), to = await receiver(), member = { ...fakeKeychain({}).env, HEAD_HOME: mkdtempSync(join(tmpdir(), 'head-home-')) };
  const [key] = await ask([tool('key', { who: 'head' })], [], member);
  match(text((await ask([tool('admit', { place: from.place, key: text(key), name: 'ana' })], [], from.env, yes([])))[0]), said('admitted'));
  match(text((await ask([tool('share', { place: from.place, to: from.pkg })], [from.shared], from.env))[0]), said('shared'));
  const held = readFileSync(join(from.place, 'TARGET.bound'), 'utf8').split('\n'), own = (re: RegExp) => held.find((l) => re.test(l))!;
  const [publics, privates] = [held.flatMap((l) => (/ measure=public-key /.test(l) ? [/ value=(\S+)/.exec(l)![1]!] : [])), secretsOf(from.env)], identity = [...publics, ...privates];
  const named = ['TARGET.bound', valueOf(lock, 'link/document'), ...readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8').split('\n').flatMap((l) => / needs=(\S+)/.exec(l)?.[1] ?? [])].map((f) => join(from.pkg, f)).sort();
  deepStrictEqual([publics.length, privates.length > 0, filesIn(from.pkg).sort()], [4, true, named], 'the control: a root, two device keys and a member, the secrets behind them, and every file the package is: its lock, its link document and the bytes its lines name');
  deepStrictEqual(filesIn(from.pkg).flatMap((f) => identity.filter((s) => readFileSync(f, 'utf8').includes(s)).map(() => f)), [], 'no file of the package holds a public key or a secret of the place');
  doesNotMatch(readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8'), / scope=(keys|signer|admit|access|allow)\/| measure=(public-key|signer|coverage|class) /);
  const [mine, before] = [keysOf(to.place), readFileSync(join(to.place, 'TARGET.bound'), 'utf8')], kept = readFileSync(join(from.pkg, 'TARGET.bound'), 'utf8'), secrets = secretsOf(to.env);
  for (const line of [own(/ measure=public-key .*scope=keys\/root /), own(/ measure=signer .*scope=keys\/root /), own(/ measure=coverage .*scope=keys\/ana /), own(/ measure=public-key .*scope=keys\/ana /).replace('scope=keys/ana', 'scope=sources/ana')]) {
    const asked: string[] = [], [got] = await receive(to, from.pkg, resaid(from.pkg, (ls) => [...ls, line.replace(/ (epoch|sig)=\S+/g, '')]), asked, [from.shared]);
    match(text(got), said('package-line')); deepStrictEqual([asked, readFileSync(join(to.place, 'TARGET.bound'), 'utf8')], [[], before]);
    writeFileSync(join(from.pkg, 'TARGET.bound'), kept);
  }
  const [got] = await receive(to, from.pkg, digestOf(kept), [], [from.shared]);
  match(text(got), said('received'));
  deepStrictEqual([keysOf(to.place), secretsOf(to.env)], [mine, secrets], 'received: the same root, the same keys, no member, no secret made or moved');
});
