import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { declaredOf } from '../src/core/lock.ts';
import { surfaceMetrics, duplicateBodies } from './release-source-metrics.ts';
const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):e.isFile()?[join(dir,e.name)]:[]);
const row=(scope:string,measure:string,n:number)=>({scope,role:'writes',measure,bound:{kind:'interval' as const,lo:n,hi:n}});
/** Current source and policy only. Literal scans and response/README promises have separate unpaid gates. */
export function run(place:string){
  if(place.replace(/\/$/,'')!=='src')return[row('release-source/current-inputs','defects',0)];
  const lock=declaredOf(readFileSync('TARGET.bound','utf8')),sources=Object.fromEntries(walk('src').filter(p=>p.endsWith('.ts')).sort().map(p=>[p,readFileSync(p,'utf8')])),surface=surfaceMetrics(sources,lock);
  return[row('surface/unmatched','count',surface.unmatched),row('tools/config','count',surface.configuring),row('duplicate/src','duplicate-bodies',duplicateBodies(sources).length)];
}
