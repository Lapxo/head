import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { valueOf } from '../src/core/lock.ts';
import { published } from '../src/ports/adapters/request.ts';
import { digestOf } from '../src/ports/cache.ts';
import { lockAt } from '../src/ports/place.ts';

/**
 * Every world head's lock pins, read once from its release by digest into a folder of this device, and served from there
 * to head and to every bound it starts: a request for a pinned address is answered with the bytes kept under its digest,
 * which both still verify. Nothing in head knows of it; the tests run offline once the folder is filled.
 */
const lock = lockAt(fileURLToPath(new URL('..', import.meta.url)));
const folder = join(tmpdir(), 'head-worlds');
mkdirSync(folder, { recursive: true });
export const worldBytes = (digest: string): string => join(folder, digest.slice('sha256:'.length));
const pins = lock.flatMap((l) => ((m) => (m ? [{ url: valueOf(lock, `sources/${m[1]}${m[2] === 'blob' ? '-blob' : ''}`), digest: l.value ?? '' }] : []))(/^world\/([^/]+)\/(standing|blob)$/.exec(l.scope ?? '')));
for (const { url, digest } of pins) {
  if (existsSync(worldBytes(digest)) && digestOf(readFileSync(worldBytes(digest))) === digest) continue;
  const got = await published(url, digest, 16_777_216, 30_000);
  if (got === undefined) throw Error(`the release publishes no bytes that hash to ${digest} at ${url}`);
  writeFileSync(worldBytes(digest), got);
}
export const offline = (env: Readonly<Record<string, string | undefined>> = process.env): Record<string, string> => ({
  NODE_OPTIONS: [env['NODE_OPTIONS'], `--import ${fileURLToPath(new URL('./offline-worlds.mjs', import.meta.url))}`].filter(Boolean).join(' '),
  HEAD_TEST_WORLDS: JSON.stringify(Object.fromEntries(pins.map((p) => [p.url, worldBytes(p.digest)]))),
});
