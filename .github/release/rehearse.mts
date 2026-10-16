// The release judged as release.yml judges it, on a pull request, with nothing published: an approval of the archive
// npm pack made, signed by the key a copy of the lock admits as its owner — a throwaway one, the copy founded once — is
// read READY by bound, and the same approval unsigned is refused. Nothing leaves the runner.
// usage: node .github/release/rehearse.mts <package.tgz>
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { canonical, parse } from '@lapxo/topos/wire';

const archive = resolve(process.argv[2]!), root = resolve(import.meta.dirname, '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string; repository: { url: string } };
const bound = join(dirname(createRequire(import.meta.url).resolve('@lapxo/bound/package.json')), 'dist/cli/verb.js');
const at = mkdtempSync(join(tmpdir(), 'head-rehearsal-')), place = join(at, 'place'), pair = generateKeyPairSync('ed25519');
writeFileSync(join(at, 'key.pem'), pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
const owner = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const throwaway = (line: string) => ((got) => (got.kind !== 'fact' || got.value.fields.scope !== 'keys/owner' || got.value.fields.measure !== 'public-key' ? line
  : ((f) => canonical({ ...Object.fromEntries(Object.entries(f).filter(([k]) => !['sig', 'epoch'].includes(k))), by: 'target', value: owner }))(got.value.fields)))(parse(line) as { kind: string; value: { fields: Record<string, string> } });
mkdirSync(place);
writeFileSync(join(place, 'TARGET.bound'), readFileSync(join(root, 'TARGET.bound'), 'utf8').split('\n').map((l) => (l.startsWith('bound-lock/1') ? throwaway(l) : l)).join('\n'));
const run = (args: readonly string[]) => spawnSync(process.execPath, [bound, ...args], { cwd: place, encoding: 'utf8' });
const must = (what: string, got: ReturnType<typeof run>) => { if (got.status !== 0) { console.error(`RED ${what} · ${got.stderr.trim().split('\n')[0]}`); process.exit(1); } return got.stdout; };
must('found', run(['land', '--key-file', join(at, 'key.pem')]));
const tag = `v${pkg.version}`, name = basename(archive), digest = `sha256:${createHash('sha256').update(readFileSync(archive)).digest('hex')}`;
const source = `${pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')}/releases/download/${tag}/${name}`;
writeFileSync(join(at, 'approval.bound'), `${[[`release/${tag}`, 'digest', digest], ['release/artifact', 'id', name], ['sources/archive', 'id', source]]
  .map(([scope, measure, value]) => canonical({ at: 'witness:release-rehearsal', by: 'target', form: 'alphabet', measure: measure!, role: 'writes', scope: scope!, value: value! })).join('\n')}\n`);
writeFileSync(join(at, 'approval-signed'), must('sign', run(['sign', join(at, 'approval.bound'), '--key', 'owner', '--key-file', join(at, 'key.pem')])));
const verdict = must('judge', run(['fold', '--as', 'release', join(at, 'approval-signed')])).trim(), unsigned = run(['fold', '--as', 'release', join(at, 'approval.bound')]);
if (verdict !== `READY ${digest} ${name} ${source}`) { console.error(`RED the approval read ${verdict}`); process.exit(1); }
if (unsigned.status === 0) { console.error('RED an unsigned approval was read READY'); process.exit(1); }
console.log(`REHEARSED ${tag} · ${verdict} · unsigned: ${unsigned.stderr.trim().split('\n')[0]}`);
