import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, parse } from '@lapxo/topos/wire';
import { run } from './cli.ts';
import { born, root } from './place.ts';

const owned = (line: string, key: string) => ((got) => (got.kind !== 'fact' || got.value.fields['scope'] !== 'keys/owner' || got.value.fields['measure'] !== 'public-key' ? line
  : canonical({ ...Object.fromEntries(Object.entries(got.value.fields).filter(([k]) => !['sig', 'epoch'].includes(k))), by: 'target', value: key })))(parse(line) as { kind: string; value: { fields: Record<string, string> } });

test('a release approval is judged as the release workflow judges it: three lines naming the archive-s digest, its name and where it is published, signed by the key the lock admits as its owner, read READY by bound; the same approval unsigned is refused', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string; repository: { url: string } };
  const keys = mkdtempSync(join(tmpdir(), 'head-release-')), pair = generateKeyPairSync('ed25519'), pem = join(keys, 'owner.pem');
  writeFileSync(pem, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const key = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const lines = readFileSync(join(root, 'TARGET.bound'), 'utf8').split('\n');
  const owner = lines.filter((l) => { const got = parse(l); return got.kind === 'fact' && got.value.fields.scope === 'keys/owner'; }).map((l) => owned(l, key));
  const { place: at } = born(undefined, owner, null, false, 'release', false, false);
  ok(run('@lapxo/bound', at, ['fold', '--as', 'lines'])?.code === 0, 'the isolated release lock is founded and readable');
  const tag = `v${pkg.version}`, name = `lapxo-head-${pkg.version}.tgz`, digest = `sha256:${createHash('sha256').update(`an archive of ${tag}`).digest('hex')}`;
  const source = `${pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')}/releases/download/${tag}/${name}`;
  const approval = join(at, 'approval.bound'), signed = join(at, 'approval-signed');
  writeFileSync(approval, `${[[`release/${tag}`, 'digest', digest], ['release/artifact', 'id', name], ['sources/archive', 'id', source]]
    .map(([scope, measure, value]) => canonical({ at: 'witness:release-rehearsal', by: 'target', form: 'alphabet', measure: measure!, role: 'writes', scope: scope!, value: value! })).join('\n')}\n`);
  const sign = run('@lapxo/bound', at, ['sign', approval, '--key', 'owner', '--key-file', pem])!;
  deepStrictEqual(sign.code, 0, sign.err.join('\n'));
  writeFileSync(signed, `${sign.out.join('\n')}\n`);
  deepStrictEqual(run('@lapxo/bound', at, ['fold', '--as', 'release', signed])?.out, [`READY ${digest} ${name} ${source}`]);
  const unsigned = run('@lapxo/bound', at, ['fold', '--as', 'release', approval])!;
  ok(unsigned.code !== 0 && unsigned.err.some((l) => l.includes('must be signed')), unsigned.err.join('\n'));
});
