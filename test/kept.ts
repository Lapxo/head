import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lock } from './place.ts';

/**
 * fold/idle for the tests, as bound keeps its own samples: a place shaped once per digest of what shapes it — the bytes
 * it holds, and the worlds and the bound head's lock pins — its CAS kept on this device. A test lays a copy of it under
 * its own place, so the first fold of that place reads by key what was observed once, instead of observing it again.
 */
const keyOf = (parts: readonly string[]): string => createHash('sha256').update([...parts, ...lock.filter((l) => /^(world|dep)\//.test(l.scope ?? '')).map((l) => `${l.scope} ${l.value}`).sort()].join('\n')).digest('hex').slice(0, 16);
export const kept = async (parts: readonly string[], shape: () => Promise<string>): Promise<string> => {
  const at = join(tmpdir(), 'head-kept', keyOf(parts));
  if (existsSync(at)) return at;
  const [place, staged] = [await shape(), mkdtempSync(join(tmpdir(), 'head-keeping-'))];
  cpSync(join(place, '.bound', 'cas'), join(staged, 'cas'), { recursive: true });
  mkdirSync(join(tmpdir(), 'head-kept'), { recursive: true });
  try { renameSync(staged, at); } catch { rmSync(staged, { recursive: true, force: true }); }
  return at;
};
export const overlay = (place: string, warm: string): void => cpSync(join(warm, 'cas'), join(place, '.bound', 'cas'), { recursive: true, force: false });
