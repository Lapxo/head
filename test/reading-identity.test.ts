import {test} from 'node:test';
import {deepStrictEqual,ok} from 'node:assert';
import {readingOf} from '../src/ports/reading.ts';
import {born,line,viewOf} from './place.ts';
import {run} from './cli.ts';

test('identity records refuse malformed, failed, mismatched and unbound results',()=>{
 const identity='sha256:'+'a'.repeat(64);
 const printed=(value:unknown)=>({code:0,out:[JSON.stringify(value)],err:[]});
 for(const value of [{kind:'fact',view:'evidence',identity},{kind:'refuse',view:'lines',identity},{kind:'fact',view:'lines',identity:'invented'}])ok('refused' in readingOf(printed(value),'lines'));
 ok('refused' in readingOf(printed({kind:'fact',view:'lines',identity}),'lines',identity));
 ok('refused' in readingOf(printed({kind:'fact',view:'lines',identity,text:'bound-lock/1'}),'lines','sha256:'+'b'.repeat(64)));
 ok('refused' in readingOf({code:1,out:[JSON.stringify({kind:'fact',view:'lines',identity})],err:[]},'lines'));
 deepStrictEqual(readingOf(printed({kind:'fact',view:'lines',identity,text:'exact\n'}),'lines',identity),{identity,text:'exact\n'});
});

test('two unrelated admitted places use bound identities and text bound to the expected snapshot',()=>{
 const budgets=Object.entries({bytes:16777216,files:2048,readings:16,probes:1}).map(([key,n])=>line('reading-identity/'+key,key,'0..'+n,{form:'interval'}));
 for(const _ of [1,2]){
  const p=born(undefined,budgets),query=(view:string,expected?:string)=>readingOf(run('@lapxo/bound',p.place,['fold','--as',`reading-identity@${view}${expected?'@'+expected:''}`]),view,expected);
  for(const view of ['lines','evidence'] as const){const first=query(view);ok(!('refused' in first),JSON.stringify(first));if('refused' in first)continue;deepStrictEqual(query(view),first);const result=query(view,first.identity);ok(!('refused' in result));if(!('refused' in result))deepStrictEqual(result.text!.trim(),viewOf(p.place,view).trim());}
 }
});

test('the place a test is born in carries what bound needs to name an identity, as every place head founds does; no: with no finite bytes limit bound refuses by name',()=>{
 const asked=(extra:string[])=>run('@lapxo/bound',born(undefined,extra).place,['fold','--as','reading-identity@lines']);
 ok(!('refused' in readingOf(asked([]),'lines')),'born as founded');
 const refused=asked([line('reading-identity/bytes','bytes','unbounded')]);
 deepStrictEqual([refused?.code,refused?.err.some((l)=>l.includes('"code":"reading-identity/budget"'))],[1,true]);
});
