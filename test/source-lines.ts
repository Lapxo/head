import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readPhysicalLines, PHYSICAL_LINES_PROFILE } from '@lapxo/topos/contract';
import { matches } from '@lapxo/topos/wire';
import { declaredOf, type Said } from '../src/core/lock.ts';
const digest = (bytes: Uint8Array | string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export function observe(lock: readonly Said[], rows: readonly {name: string; bytes: Uint8Array; digest: string}[]) {
  const limits = lock.filter(line => line.form === 'interval' && /^[^/]+\/lines$/.test(line.scope ?? '') && lock.some(region => region.scope === `region/${line.scope!.split('/')[0]}` && region.measure === 'coordinates'));
  const scopes = new Set<string>(), groups = limits.map(line => {
    if (scopes.has(line.scope!)) throw Error('REFUSE·source-lines ambiguous interval'); scopes.add(line.scope!);
    const selected = lock.filter(region => region.scope === `region/${line.scope!.split('/')[0]}` && region.measure === 'coordinates');
    if (selected.length !== 1 || !selected[0]!.value) throw Error('REFUSE·source-lines selectors');
    const selectors = selected[0]!.value!.split('|'); if (selectors.some(s => !s)) throw Error('REFUSE·source-lines empty selector');
    const regions = line.measure === 'file-lines' ? rows.filter(row => selectors.some(s => matches(s,row.name))).map((row,i) => ({scope: `${line.scope}/file-${i}`,selectors:[row.name]})) : [{scope:line.scope!,selectors}];
    return {line,regions};
  });
  if (!groups.length) throw Error('REFUSE·source-lines no declared regions');
  for (const row of rows) if (row.bytes.length && row.bytes.at(-1) !== 10) throw Error(`REFUSE·source-lines non-LF-terminated source ${row.name}`);
  const result = readPhysicalLines({profile:PHYSICAL_LINES_PROFILE,snapshot:digest(JSON.stringify(rows.map(({name,digest})=>({name,digest})))),files:rows,regions:groups.flatMap(g=>g.regions),policy:{byteBudget:'16777216',rowBudget:'1000000'}},digest);
  if(result.status!=='read') throw Error(`REFUSE·source-lines ${result.cause}`);
  const values = new Map(result.regions.map(region => {if(region.status!=='measured'||region.value.denominator!=='1')throw Error(`REFUSE·source-lines ${region.scope} unmeasured`);const value=Number(region.value.numerator);if(!Number.isSafeInteger(value))throw Error('REFUSE·source-lines count');return[region.scope,value]}));
  return groups.map(({line,regions})=>{const n=line.measure==='file-lines'?Math.max(0,...regions.map(r=>values.get(r.scope)!)):values.get(line.scope!)!;return{scope:line.scope!,role:'writes',measure:line.measure!,bound:{kind:'interval' as const,lo:n,hi:n}}});
}
/** Sum a declared region; for file-lines emit the maximum individual physical count, never a sum. Bound judges the same admitted ceiling. */
export function run(place: string) {
  if(place.replace(/\/$/,'')!=='src')return[{scope:'source-lines/current-inputs',role:'writes',measure:'defects',bound:{kind:'interval' as const,lo:0,hi:0}}];
  const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):e.name.endsWith('.ts')?[join(dir,e.name)]:[]);
  const rows=files('src').sort().map(name=>{const bytes=readFileSync(name);return{name,bytes,digest:digest(bytes)}});
  const lock=declaredOf(readFileSync('TARGET.bound','utf8')), selection=lock.filter(line=>line.scope==='counter/source-lines/regions'&&line.measure==='id');
  if(selection.length!==1)throw Error('REFUSE·source-lines region selection');
  const scopes=selection[0]!.value!.split('|');if(!scopes.length||new Set(scopes).size!==scopes.length||scopes.some(s=>!/^[a-z][a-z0-9-]*\/lines$/.test(s)))throw Error('REFUSE·source-lines region catalogue');
  const measured=observe(lock.filter(line=>line.form!=='interval'||!line.scope?.endsWith('/lines')||scopes.includes(line.scope)),rows);
  if(measured.length!==scopes.length)throw Error('REFUSE·source-lines unmeasured selected region');
  return [...measured,{scope:'counter/source-lines/regions',role:'writes',measure:'id',bound:{kind:'enumerated' as const,values:scopes}}];
}
