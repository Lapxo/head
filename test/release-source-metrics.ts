import { members, valueOf, type Said } from '../src/core/lock.ts';
import { surfaceOf } from '../src/ports/surface.ts';
import { matches } from '@lapxo/topos/wire';
/** The same multiset equalities and source-region imports used by the surface suite. */
export function surfaceMetrics(sources: Readonly<Record<string,string>>, lock: readonly Said[]) {
  const names=Object.keys(sources), modules=(family:string)=>names.filter(p=>p.startsWith(`src/${family}/`)&&!p.slice(`src/${family}/`.length).includes('/')).map(p=>p.slice(`src/${family}/`.length).replace(/\.ts$/,'')).sort();
  const word=(scope:string)=>members(valueOf(lock,scope)),surface=surfaceOf(lock),difference=(a:readonly string[],b:readonly string[])=>{const counts=new Map<string,number>();for(const x of a)counts.set(x,(counts.get(x)??0)+1);for(const x of b)counts.set(x,(counts.get(x)??0)-1);return[...counts.values()].reduce((n,x)=>n+Math.abs(x),0)};
  const unmatched=difference(surface.catalogue.map(t=>t.name),modules('tools'))+difference(surface.resources.map(r=>r.name),modules('resources'))+difference(surface.tools.map(t=>t.name),word('surface/tools'))+difference([...word('surface/tools'),...word('ask/questions'),...word('do/actions')],modules('tools'));
  const configured=lock.filter(l=>l.scope==='tools/config'&&l.measure==='id');if(configured.length!==1)throw Error('REFUSE·release-surface config declaration');
  const regions=['places','sources'].flatMap(name=>word(`region/${name}`)),actual=modules('tools').filter(name=>{const target=/from '(\.\.\/[^']+)'/.exec(sources[`src/tools/${name}.ts`]??'')?.[1]?.replace('../','src/')??'';return names.filter(p=>regions.some(s=>matches(s,p))).includes(target)}).sort(),declared=[...members(configured[0]!.value??'')].sort();
  if(!declared.length||difference(actual,declared))throw Error('REFUSE·release-surface configuring tools mismatch');
  return{unmatched,configuring:actual.length};
}
/** Original duplicate-body predicate, shared by its regression test and the native counter. */
export function duplicateBodies(sources: Readonly<Record<string,string>>) {
  const said=new Map<string,string[]>(),body=(l:string)=>l.length>8&&!/^(import |export |\/\*\*|\*|\/\/)/.test(l);
  for(const [path,text]of Object.entries(sources)){const held=text.split('\n').map(l=>l.trim().replace(/\s+/g,' '));held.forEach((l,i)=>{const window=held.slice(i,i+3);for(const key of[body(l)&&l.length>=60?l:'',window.length===3&&window.every(body)&&window.join(' ').length>=120?window.join(' ⏎ '):''])if(key)(said.get(key)??said.set(key,[]).get(key)!).push(`${path}:${i+1}`)})}
  return[...said].filter(([,at])=>at.length>1).map(([key,at])=>({locations:at,body:key}));
}
