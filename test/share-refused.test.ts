import { test } from 'node:test';
import { deepStrictEqual, doesNotMatch, match, ok } from 'node:assert';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ask } from './client.ts';
import { said, text } from './place.ts';
import { tool, auth, jobs, digestOf, sender, receiver, receive, resaid } from './share-fixture.ts';

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
