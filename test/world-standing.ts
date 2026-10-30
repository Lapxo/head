import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { declaredOf, members, valueOf, type Said } from '../src/core/lock.ts';
import { digestIn } from '../src/core/worlds.ts';

export const MEASURE = 'world-standing-bytes';
/** Physical bytes of each selected standing, verified by its pin. Never Root bytes, a compressed blob or a sum across worlds. */
export function observe(lock: readonly Said[], take: (pin: string) => Uint8Array | undefined) {
  const selection = lock.filter(line => line.scope === 'world/adopts');
  if (selection.length !== 1) throw Error('REFUSE·world-standing missing or ambiguous selection');
  const names = members(selection[0]!.value ?? '');
  const pins = names.map(name => {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw Error('REFUSE·world-standing world name');
    const found = lock.filter(line => line.scope === `world/${name}/standing`);
    if (found.length !== 1) throw Error('REFUSE·world-standing selected world has missing or ambiguous pin');
    return found[0]!;
  });
  const digest = digestIn(lock);
  const readings = pins.map(line => {
    if (!/^sha256:[a-f0-9]{64}$/.test(line.value ?? '')) throw Error('REFUSE·world-standing pin');
    const bytes = take(line.value!);
    if (bytes === undefined || digest(bytes) !== line.value) throw Error('REFUSE·world-standing absent or altered payload');
    return { scope: `world/standing-bytes/${line.scope!.split('/')[1]}`, role: 'writes', measure: MEASURE, bound: { kind: 'interval', lo: bytes.byteLength, hi: bytes.byteLength } };
  });
  return [...(readings.length ? readings : [{ scope: 'world/standing-bytes', role: 'writes', measure: MEASURE, bound: { kind: 'interval', lo: 0, hi: 0 } }]), { scope: 'world/standing-integrity', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }];
}
/** Receives public payloads selected as native inputs. The existing Root policy owns the pin set and the numeric limit. */
export function run(place: string) {
  const lock = declaredOf(readFileSync('TARGET.bound', 'utf8'));
  if (digestIn(lock)(readFileSync('docs/contracts/world-standing-size.json')) !== 'sha256:25b0bfe9c37a169367ce0152ca1379623f3585e7111b3b3807bb45e64bcbd737') throw Error('REFUSE·world-standing contract digest');
  const rows = observe(lock, pin => {
    try { return readFileSync(join('samples/world-standing/yes/payloads', `${pin.slice(7)}.bound`)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  });
  return place.replace(/\/$/, '') === 'samples/world-standing/yes' ? rows : [{ scope: 'world/standing-current-inputs', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }];
}
