import { test } from 'node:test';
import { strict as a } from 'node:assert';
import { surfaceMetrics, duplicateBodies } from './release-source-metrics.ts';
import { scan } from './pack-literals.ts';
import type { Said } from '../src/core/lock.ts';
const row=(scope:string,value:string):Said=>({scope,measure:'id',value});
for(const name of ['warehouse','observatory']) {
  const sources={['src/tools/'+name+'.ts']:"import { x } from '../places/create.ts';\n",'src/places/create.ts':'export const x = 1;\n'},lock:Said[]=[row('tool/'+name,''),row('surface/tools',name),row('tools/config',name),{scope:'region/places',measure:'coordinates',value:'src/places/**'}];
  test(name+': surface equalities retain multiplicity and configuration identity',()=>{
    a.deepEqual(surfaceMetrics(sources,lock),{unmatched:0,configuring:1});
    a.ok(surfaceMetrics(sources,[...lock,row('tool/'+name,'')]).unmatched>0);
    a.ok(surfaceMetrics({...sources,'src/tools/extra.ts':'export {};\n'},lock).unmatched>0);
    a.ok(surfaceMetrics(sources,[...lock,row('resource/extra','')]).unmatched>0);
    a.ok(surfaceMetrics(sources,[...lock,row('ask/questions',name)]).unmatched>0);
    a.throws(()=>surfaceMetrics(sources,lock.map(l=>l.scope==='tools/config'?row('tools/config','other'):l)));
    a.throws(()=>surfaceMetrics(sources,[...lock,row('tools/config',name)]));
  });
  test(name+': duplicate-body classifier preserves the original line and window predicates',()=>{
    const body='const result = '+JSON.stringify(name.repeat(10))+';';
    a.equal(duplicateBodies({a:body,b:body}).length,1);
    a.deepEqual(duplicateBodies({a:'import '+body,b:'import '+body}),[]);
    const lines=['const first = '+JSON.stringify(name.repeat(3))+';','const second = '+JSON.stringify(name.repeat(3))+';','const third = '+JSON.stringify(name.repeat(3))+';'].join('\n');
    a.ok(duplicateBodies({a:lines,b:lines}).some(x=>x.body.includes(' ⏎ ')));
    a.deepEqual(duplicateBodies({a:body}),[]);
  });
  test(name+': planted literal counts never echo token, private path or organisation',()=>{
    const token=['gh','p_','X'.repeat(36)].join(''),path=['','Users',name,'private'].join('/'),word=name+'-private-name';
    const found=scan([{path:'src/example.ts',bytes:Buffer.from([token,path,word,'https://outside.example.invalid'].join(' '))}],[],new Set(),[word],new Set());
    for(const k of ['literal/key','literal/path','literal/org','literal/host'])a.equal(found[k]!.length,1);
    const report=JSON.stringify(found);for(const secret of[token,path,word])a.ok(!report.includes(secret));
    a.deepEqual(scan([{path:'src/example.ts',bytes:Buffer.from('https://localhost')}],[],new Set(['localhost']),[],new Set())['literal/host'],[]);
  });
}
