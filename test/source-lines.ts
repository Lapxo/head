import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readPhysicalLines, PHYSICAL_LINES_PROFILE } from '@lapxo/topos/contract';
import { declaredOf, valueOf } from '../src/core/lock.ts';

const digest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
/** Read current source bytes through the published physical-line model; Bound judges the declared intervals. */
export function run(place: string) {
  if (place.replace(/\/$/, '') !== 'src') return [{ scope: 'source-lines/current-inputs', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }];
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);
  const lock = declaredOf(readFileSync('TARGET.bound', 'utf8'));
  const rows = files('src').sort().map(name => { const bytes = readFileSync(name); if (bytes.length && bytes.at(-1) !== 10) throw Error(`REFUSE·source-lines non-LF-terminated source ${name}`); return { name, bytes, digest: digest(bytes) }; });
  const regions = ['source', 'core', 'doors', 'sources', 'access'].map(name => ({ scope: `${name}/lines`, selectors: valueOf(lock, `region/${name}`).split('|') }));
  const result = readPhysicalLines({ profile: PHYSICAL_LINES_PROFILE, snapshot: digest(Buffer.from(JSON.stringify(rows.map(({ name, digest }) => ({ name, digest }))))), files: rows, regions, policy: { byteBudget: '16777216', rowBudget: '1000000' } }, digest);
  if (result.status !== 'read') throw Error(`REFUSE·source-lines ${result.cause}`);
  return result.regions.map(region => {
    if (region.status !== 'measured' || region.value.denominator !== '1') throw Error(`REFUSE·source-lines ${region.scope} unmeasured`);
    const value = Number(region.value.numerator);
    if (!Number.isSafeInteger(value)) throw Error('REFUSE·source-lines count');
    return { scope: region.scope, role: 'writes', measure: region.scope.replace('/', '-'), bound: { kind: 'interval', lo: value, hi: value } };
  });
}
