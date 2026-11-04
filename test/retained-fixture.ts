export const retentionCases: { name: string; check: () => void }[] = [];
const test = (name: string, check: () => void) => { retentionCases.push({ name, check }); };
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { retainedIn } from '../src/core/package.ts';
import { digestIn } from '../src/core/worlds.ts';
import { declaredOf } from '../src/core/lock.ts';
import type { Context } from '../src/core/answer.ts';
import { readFileSync } from 'node:fs';

const lock = declaredOf(readFileSync('TARGET.bound', 'utf8'));
const fixture = (domain: string) => {
  const place = `/fixture/${domain}`, digest = digestIn(lock), files = new Map<string, Uint8Array>();
  const world = Buffer.from(`world ${domain}`), pin = Buffer.from(`compiled first ${domain}`), other = Buffer.from(`compiled second ${domain}`);
  const document = { kind: 'json', bytes: Buffer.from(`document ${domain}`) }, overlay = { kind: 'json', bytes: Buffer.from(`overlay ${domain}`) };
  const sources = [{ source: 'first', pin: digest(pin), document, overlay }, { source: 'second', pin: digest(other), document }];
  const own = [{ scope: 'uses/world', measure: 'digest', value: digest(world), needs: 'worlds/world.bound' },
    { scope: 'uses/first', measure: 'digest', value: digest(pin), needs: 'pins/first/source.bound' }, { scope: 'uses/second', measure: 'digest', value: digest(other), needs: 'pins/second/source.bound' }];
  const published: Record<string, string>[] = [{ scope: 'uses/world', measure: 'digest', value: digest(world) }, { scope: 'uses/first', measure: 'digest', value: digest(pin), needs: 'pins/first/source.bound' },
    { scope: 'uses/second', measure: 'digest', value: digest(other), needs: 'pins/second/source.bound', restsOn: 'uses/first' }];
  for (const [path, bytes] of [['worlds/world.bound', world], ['pins/first/source.bound', pin], ['pins/second/source.bound', other],
    ['connected/first.json', document.bytes], ['connected/first.overlay.json', overlay.bytes], ['connected/second.json', document.bytes]] as const) files.set(join(place, path), bytes);
  let reads = 0;
  const context = { lock, files: { take: (path: string) => { reads++; return files.get(path); }, read: { laidOf: (_context: unknown, _place: string, source: string) => [...files].filter(([path]) => path.startsWith(join(place, 'connected', source) + '.')).map(([path, bytes]) => [path.slice(place.length + 1), bytes]) } } } as unknown as Context;
  return { place, files, sources, own, published, check: () => retainedIn(context, place, own, sources, published), context, reads: () => reads };
};

for (const domain of ['warehouse', 'observatory']) {
  test(`${domain}: retained sources require current receiver pins, bytes, overlays and dependency closure`, () => {
    const f = fixture(domain);
    assert.deepEqual([...f.check()], ['first', 'second']);
    f.files.set(join(f.place, 'connected/first.json'), Buffer.from('altered'));
    assert.deepEqual([...f.check()], []);
    assert.ok(f.reads() > 0);
  });
  for (const changed of ['connected/first.overlay.json', 'pins/first/source.bound', 'worlds/world.bound']) test(`${domain}: missing or altered ${changed} cannot reuse dependent pins`, () => {
    const f = fixture(domain); f.files.delete(join(f.place, changed)); assert.equal(f.check().size, 0);
    f.files.set(join(f.place, changed), Buffer.from('altered')); assert.equal(f.check().size, 0);
  });
  test(`${domain}: a package digest and its bytes confer no receiver authority`, () => {
    const f = fixture(domain);
    assert.equal(retainedIn(f.context, f.place, [], f.sources, f.published).size, 0);
    f.own.splice(1, 1); assert.equal(f.check().size, 0);
  });
  test(`${domain}: unexpected overlays and changed dependency pins invalidate reuse`, () => {
    const f = fixture(domain); f.files.set(join(f.place, 'connected/first.overlay.yaml'), Buffer.from('extra')); assert.equal(f.check().size, 0);
    f.files.delete(join(f.place, 'connected/first.overlay.yaml')); f.own[1]!.value = 'sha256:' + '0'.repeat(64); assert.equal(f.check().size, 0);
  });
  test(`${domain}: duplicate pins and escaping paths are not eligible for reuse`, () => {
    const f = fixture(domain); f.own.push({ ...f.own[1]! }); assert.equal(f.check().size, 0);
    f.own.pop(); f.own[1]!.needs = 'pins/../../outside'; assert.equal(f.check().size, 0);
  });
}
