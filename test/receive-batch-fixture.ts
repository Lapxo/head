import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { strict as assert } from 'node:assert';
import { ask } from './client.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { text } from './place.ts';
import { tool, yes, auth, jobs, overlay, digestOf } from './share-fixture.ts';
import { declaredOf } from '../src/core/lock.ts';
import { worldBytes } from './worlds.ts';
import { lockAt } from '../src/ports/place.ts';
const lock = lockAt(new URL('..', import.meta.url).pathname);
export const sourcePins = (place: string) => declaredOf(readFileSync(join(place, 'TARGET.bound'), 'utf8')).filter(l => l.scope?.startsWith('uses/') && l.needs?.startsWith('pins/')).map(l => [l.scope!, l.value!]).sort();
export const primed = (place: string) => {
  const cas = join(place, '.bound/cas/blobs'); mkdirSync(cas, { recursive: true });
  for (const line of lock.filter(l => /^world\/[^/]+\/(standing|blob)$/.test(l.scope ?? ''))) copyFileSync(worldBytes(line.value!), join(cas, line.value!.slice(7)));
};
export const receivingFixture = async (domain: string) => {
  const home = mkdtempSync(join(tmpdir(), `head-receive-${domain}-`)), keychain = fakeKeychain({}), place = join(home, 'place');
  const env = { ...keychain.env, HOME: home, USERPROFILE: home, HEAD_HOME: join(home, 'index') };
  const [born] = await ask([tool('place', { dir: place })], [], env, yes([]));
  assert.ok(!text(born).includes('state=refused'), text(born)); primed(place); primed(env.HEAD_HOME);
  return { place, env, keychain };
};
export const packageFixture = async (domain: string) => {
  const from = await receivingFixture(domain), shared = join(from.place, 'documents'); mkdirSync(shared);
  writeFileSync(join(shared, 'auth.json'), auth); writeFileSync(join(shared, 'jobs.json'), jobs); writeFileSync(join(shared, 'jobs.overlay.yaml'), overlay);
  const results = await ask([tool('connect', { place: from.place, source: 'jobs', document: join(shared, 'jobs.json'), overlay: join(shared, 'jobs.overlay.yaml') }), tool('connect', { place: from.place, source: 'auth', document: join(shared, 'auth.json') })], [shared], from.env, yes([]));
  for (const result of results) assert.ok(text(result).includes('head/connected'), text(result));
  const pkg = join(from.place, 'package');
  const [packed] = await ask([tool('share', { place: from.place, to: pkg })], [shared], from.env);
  assert.ok(text(packed).includes('head/shared'), text(packed));
  return { ...from, pkg, digest: digestOf(readFileSync(join(pkg, 'TARGET.bound'))), expected: sourcePins(from.place) };
};
