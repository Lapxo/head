import { test } from 'node:test';
import { equal, ok } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonical, parse } from '@lapxo/topos/wire';
import { adopted } from '../src/adopt/adopt.ts';
import { lock } from './place.ts';
import { valueOf } from '../src/core/lock.ts';
import type { Context } from '../src/core/answer.ts';
function fixture(own: readonly Record<string,string>[] = []) {
 const writes:string[]=[],lots:string[][]=[];
 const context = {lock,policy:async()=>({lines:own}),cache:{held:(digest:string)=>readFileSync(join(tmpdir(),'head-worlds',digest.slice(7)))},files:{lay:(_p:string,path:string)=>writes.push(path)}} as unknown as Context;
 const line=(scope:string,measure:string,value:string,more:Record<string,string>={})=>canonical({at:'policy:fixture',by:'target',form:'alphabet',role:'writes',scope,measure,value,...more});
 const land=async(lot:readonly string[])=>{lots.push([...lot]);return{lines:[...lot]};};return{context,writes,lots,line,land};
}
test('adopt model: registration and response coordinates come only from the pinned producer',async()=>{
 const f=fixture();const got=await adopted(f.context,'/fixture',f.land,f.line,['topos-mcp']);equal('refused'in got,false);
 const rows=f.lots.flat().map(line=>parse(line)).flatMap(p=>p.kind==='fact'?[p.value.fields]:[]);
 ok(rows.some(row=>row.scope==='view/mcp-answer'&&row.value==='mcp-answer@1'&&row.role==='demands'));
 ok(rows.some(row=>row.scope==='region/mcp-response'&&row.measure==='coordinates'&&row.value===valueOf(lock,'place/answers/coordinates')));
 ok(!rows.some(row=>row.scope==='uses/topos-openapi'),'an explicit protocol does not install an unused default world');
 ok(!rows.some(row=>row.scope?.startsWith('grant/')||row.scope?.startsWith('keys/')));
});
test('adopt model: existing world pin and conflicting view refuse before writes or landing',async()=>{
 for(const own of [[{scope:'uses/topos-mcp',value:'sha256:'+'0'.repeat(64)}],[{scope:'view/mcp-answer',role:'demands',value:'different@1'}]]){
  const f=fixture(own);const got=await adopted(f.context,'/fixture',f.land,f.line,['topos-mcp']);equal('refused'in got,true);equal(f.lots.length,0);
 }
});
