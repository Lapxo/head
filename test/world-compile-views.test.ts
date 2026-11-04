import { test } from 'node:test';
import { deepStrictEqual, throws } from 'node:assert/strict';
import { compileViews } from '../src/adopt/adopt.ts';
import { canonical } from '@lapxo/topos/wire';
import { createHash } from 'node:crypto';
const digest=(s:Uint8Array|string)=>'sha256:'+createHash('sha256').update(s).digest('hex');
const context=(names:(string|undefined)[], mutate?:string)=>{
 const lock:any=[{scope:'place/worlds',value:'worlds'},{scope:'place/view',value:'place'},{scope:'birth/view/place',value:'place@1'},{scope:'wire/digest-algorithms',value:'sha256'}],own:any[]=[],files=new Map<string,Uint8Array>();
 names.forEach((name,i)=>{const fields=name?[{scope:'capsule/compile-region',value:name},{scope:'region/'+name,role:'render',measure:'reads',value:'read/**'},{scope:'region/'+name,role:'writes',measure:'writes',value:'region/**'}]:[{scope:'region/place',role:'render',measure:'reads',value:'read/**'}];
 const bytes=new TextEncoder().encode(fields.map(f=>canonical({at:'policy:fixture',by:'target',form:'alphabet',measure:'id',role:'writes',...f})).join('\n')+'\n'),path=`/place/worlds/domain-${i}.bound`;
 files.set(path,bytes);own.push({scope:'uses/domain-'+i,needs:`worlds/domain-${i}.bound`,value:digest(bytes)});if(name)own.push({scope:'view/'+name,role:'demands',value:name+'@1'});});
 if(mutate==='bytes')files.set('/place/worlds/domain-0.bound',new Uint8Array());
 if(mutate==='view')own.find(l=>l.scope.startsWith('view/')).value='other@1';
 return {c:{lock,files:{take:(p:string)=>files.get(p)}} as any,own};
};
for(const names of [['alpha-compile','beta-compile'],['beta-compile','alpha-compile'],['single-compile'],[undefined]])test('resolve '+names.join('|'),()=>{const{c,own}=context(names);deepStrictEqual(compileViews(c,'/place',own),names.map(n=>n??'place'));});
for(const names of [[undefined,undefined],['alpha-compile',undefined],['same','same'],['../view']])test('reject ambiguous or malformed '+names.join('|'),()=>{const{c,own}=context(names);throws(()=>compileViews(c,'/place',own),/world\/compile-/);});
for(const mutation of ['bytes','view'])test('reject changed '+mutation,()=>{const{c,own}=context(['single-compile'],mutation);throws(()=>compileViews(c,'/place',own),/world\/compile-/);});

test('two compilers claiming one source cannot pin or land it', async()=>{
 const { pinIn } = await import('../src/compile/pin.ts');
 const { lockAt } = await import('../src/ports/place.ts');
 const { c,own }=context(['alpha-compile','beta-compile']);let pins=0,lands=0;
 c.lock=lockAt(process.cwd());
 c.policy=async()=>({lines:own});c.world=async()=>({lines:[{scope:'region/shared',measure:'documents',value:'connected/shared.json'},{scope:'offers/shared/read',measure:'class',value:'callable'}]});
 c.pinned=async()=>{pins++;throw Error('must not pin');};c.files.lay=()=>{throw Error('must not write a pin');};c.now=()=>0;
 const pin=pinIn(c,'/place',async()=>{lands++;return{lines:[]};},()=> '');
 const got=await pin('shared',[]);deepStrictEqual({pins,lands},{pins:0,lands:0});
 if(!('said'in got))throw Error('collision unexpectedly pinned');
 if(!got.said.some(s=>s.includes('world/compile-collision')))throw Error(got.said.join('\n'));
});

for(const reverse of [false,true])test('select offers, preserve their bounds and ignore another world diagnostic '+reverse,async()=>{
 const { pinIn }=await import('../src/compile/pin.ts'),{ lockAt }=await import('../src/ports/place.ts');
 const {c,own}=context(reverse?['beta-compile','alpha-compile']:['alpha-compile','beta-compile']);let draft='';
 c.lock=lockAt(process.cwd());c.policy=async()=>({lines:own});
 c.world=async(_place:string,view:string)=>({lines:view==='alpha-compile'?[{scope:'region/shared',measure:'documents',value:'connected/shared.json'},{scope:'offers/shared/read',measure:'class',value:'callable'},{scope:'read/selected',form:'interval',value:'0..7'}]:[{scope:'region/shared',measure:'unparsed',value:'not my protocol'},{scope:'read/unselected',form:'interval',value:'0..99'}]});
 c.files.lay=(_p:string,rel:string,bytes:Uint8Array)=>{if(rel.endsWith('.draft.bound'))draft=new TextDecoder().decode(bytes);};c.files.drop=()=>{};
 c.pinned=async()=>({pin:digest('pinned'),bytes:'pinned',lines:[]});c.now=()=>0;
 const got=await pinIn(c,'/place',async()=>({lines:[]}),()=> '')('shared',[]);
 if('said'in got)throw Error(got.said.join('\n'));
 if(!draft.includes('scope=read/selected')||draft.includes('read/unselected')||draft.includes('not my protocol'))throw Error('compiler boundaries lost');
});
