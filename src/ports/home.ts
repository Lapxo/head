import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import type { KeyStore } from './keychain.ts';
import { canonicalPath } from './place.ts';

/** A namespace locates keys. Only comparison with authenticated public keys establishes compatibility. */
export const homeServices = (base: string, home: string) => ({
  canonical: canonicalPath(home),
  primary: `${base}/home-${createHash('sha256').update(canonicalPath(home)).digest('hex')}`,
  legacy: `${base}/${basename(home).replace(/[^\w.-]+/g, '-')}`,
});
export async function homeService(base: string, home: string, expected: ReadonlyMap<string, string> | undefined, store: (service: string) => KeyStore, consent: () => Promise<'yes' | 'no' | 'none'>) {
  const names = homeServices(base, home);
  if (!expected) return names.primary;
  if (!expected.size) throw Error('home/identity');
  const matches = async (keys: KeyStore) => { for (const [account, publicKey] of expected) if (await keys.held?.(account) !== publicKey) return false; return true; };
  const primary = store(names.primary);
  if (await matches(primary)) return names.primary;
  for (const account of expected.keys()) if (await primary.held?.(account) !== undefined) throw Error('home/identity');
  const legacy = store(names.legacy);
  if (!await matches(legacy)) throw Error('home/identity');
  const marker = 'home-binding/v1', bound = legacy.read(marker);
  if (bound !== undefined && bound !== names.canonical) throw Error('home/namespace');
  if (bound === undefined) {
    if (await consent() !== 'yes') throw Error('home/approval');
    legacy.write(marker, names.canonical);
    if (legacy.read(marker) !== names.canonical) throw Error('home/namespace');
  }
  return names.legacy;
}
