import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { received } from '../src/sources/connect.ts';
import { declaredOf, valueOf } from '../src/core/lock.ts';
import { linesOf, digestIn } from '../src/core/worlds.ts';
import { lockAt } from '../src/ports/place.ts';
import { unpacked } from '../src/core/package.ts';
import * as documents from '../src/ports/documents.ts';
import type { Context } from '../src/core/answer.ts';
const lock=declaredOf(readFileSync('TARGET.bound','utf8')),digest=digestIn(lock);
const line=(scope:string,value:string,measure='digest')=>({scope,value,measure,form:'alphabet',role:'writes',by:'target',at:'policy:fixture'});
const spec=(name:string)=>Buffer.from(JSON.stringify({openapi:'3.0.3',info:{title:name,version:'1'},paths:{}}));
for(const domain of ['warehouse','observatory']) for(const change of ['document','overlay','world','policy','refused-land']) test(`${domain}: ${change} cannot produce receive success from a stale prepared reading`, async()=>{
 const place='/fixture/'+domain,doc=spec(domain),overlay=Buffer.from('overlay'),compiled=Buffer.from('pin'),world=Buffer.from('bound-lock/1 at=policy:fixture by=target form=alphabet measure=reads role=render scope=region/place value=read/**\n');
 const source=domain, worldName=valueOf(lock,'world/adopts').split('|')[0]!,worldDigest=digest(world),fixtureLock=lock.map(l=>l.scope===`world/${worldName}/standing`?{...l,value:worldDigest}:l);
 const files=new Map<string,Uint8Array>([[join(place,'worlds',worldName+'.bound'),world]]);
 let policy: import('../src/core/lock.ts').Said[] =[{...line('uses/'+worldName,worldDigest),needs:'worlds/'+worldName+'.bound'}],worldCalls=0,sourceAdmissions=0;
 const pinBytes=Buffer.from('bound-lock/1 at=place:fixture by=target form=alphabet measure=class role=writes scope=offers/'+source+'/read value=callable\n');
 const packageText=[`bound-lock/1 at=policy:fixture by=target form=alphabet measure=digest role=writes scope=uses/${worldName} value=${worldDigest}`,`bound-lock/1 at=policy:fixture by=target form=alphabet measure=digest needs=connected/${source}.json role=writes scope=sources/${source} value=${digest(doc)}`,`bound-lock/1 at=policy:fixture by=target form=alphabet measure=digest needs=connected/${source}.overlay.json role=writes scope=sources/${source}/overlay value=${digest(overlay)}`,`bound-lock/1 at=policy:fixture by=target form=alphabet measure=digest needs=pins/${source}.bound role=writes scope=uses/${source} value=${digest(pinBytes)}`].join('\n')+'\n';
 const publicFiles=new Map([['connected/'+source+'.json',doc],['connected/'+source+'.overlay.json',overlay],['pins/'+source+'.bound',pinBytes]]);
 const context={lock:fixtureLock,receiving:async(_p:string,work:()=>Promise<readonly string[]>)=>work(),policy:async()=>({lines:policy}),world:async()=>{worldCalls++; if(change==='document')files.set(join(place,'connected',source+'.json'),Buffer.from('altered')); if(change==='overlay')files.set(join(place,'connected',source+'.overlay.json'),Buffer.from('altered')); if(change==='world')files.set(join(place,'worlds',worldName+'.bound'),Buffer.from('altered')); if(change==='policy')policy=[...policy,line('allow/changed','changed','id')]; return {lines:[line('region/'+source,'https://fixture.example','origins'),line('offers/'+source+'/read','callable','class')]};},
 files:{read:documents,take:(at:string)=>files.get(at),lay:(p:string,rel:string,bytes:Uint8Array)=>{if(!files.has(join(p,rel)))files.set(join(p,rel),bytes);},drop:(p:string,rel:string)=>files.delete(join(p,rel)),list:(p:string,rel:string)=>[...files.keys()].filter(at=>at.startsWith(join(p,rel)+'/')).map(at=>at.slice(join(p,rel).length+1))},
 pinned:async()=>({pin:digest(pinBytes),bytes:pinBytes.toString(),lines:linesOf(pinBytes)}),landRoot:async()=>{sourceAdmissions++;return{refused:'fixture/coverage'};},settle:async()=>[],now:()=>0,machine:()=>0}as unknown as Context;
 const result=await received(context,place,'/public/TARGET.bound',Buffer.from(packageText),digest(packageText),'fixture',publicFiles);
 if(change!=='refused-land') { assert.ok(result.some(line=>line.includes('next.document=\"/public/TARGET.bound\"')),result.join('\n')); assert.ok(result.some(line=>line.includes('next.digest=\"sha256:')),result.join('\n')); }
 assert.equal(worldCalls,1);assert.equal(sourceAdmissions,change==='refused-land'?1:0);assert.ok(!result.some(s=>s.includes('head/received ')),result.join('\n'));assert.ok(result.some(s=>s.includes(change==='refused-land'?'fixture/coverage':'receive/inputs-changed')),result.join('\n'));
});
