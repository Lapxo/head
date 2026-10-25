import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import type { NativeHostOptions } from '@lapxo/bound/host';
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
  NODE_OPTIONS: [env['NODE_OPTIONS'], `--import ${fileURLToPath(new URL('./offline-worlds.ts', import.meta.url))}`].filter(Boolean).join(' '),
  HEAD_TEST_WORLDS: JSON.stringify(Object.fromEntries(pins.map((p) => [p.url, worldBytes(p.digest)]))),
});

/** Pinned world bytes through real HTTPS, with trust and internal destinations explicit in the receiver policy. */
export const hostWorlds = async (redirects?: { readonly maxRedirects: number; readonly headerBytes: number }) => {
  const scratch = mkdtempSync(join(tmpdir(), 'head-world-https-')), key = join(scratch, 'key.pem'), cert = join(scratch, 'cert.pem');
  const made = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-keyout', key, '-out', cert], { encoding: 'utf8' });
  if (made.status !== 0) { rmSync(scratch, { recursive: true, force: true }); throw Error('fixture trust unavailable'); }
  const seen: string[] = []; let altered = false;
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    seen.push(req.url ?? '');
    if (req.url?.startsWith('/redirect/')) { res.writeHead(302, { location: '/' + req.url.slice('/redirect/'.length) }); res.end(); return; }
    const digest = /^\/([a-f0-9]{64})$/.exec(req.url ?? '')?.[1], file = digest && worldBytes(`sha256:${digest}`);
    if (!file || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.end(altered ? Buffer.from('altered fixture bytes') : readFileSync(file));
  });
  try { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); }
  catch (error) { rmSync(scratch, { recursive: true, force: true }); throw error; }
  const origin = `https://localhost:${(server.address() as { port: number }).port}`;
  const policy: NativeHostOptions['http'] = { origins: [origin], ...(redirects ? { redirects } : {}), ca: readFileSync(cert, 'utf8'), internalDestinations: [{ hostname: 'localhost', address: '127.0.0.1' }] };
  return { policy, seen, corrupt: () => { altered = true; }, url: (digest: string) => `${origin}/${redirects ? 'redirect/' : ''}${digest.slice('sha256:'.length)}`, close: async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); rmSync(scratch, { recursive: true, force: true }); } };
};
