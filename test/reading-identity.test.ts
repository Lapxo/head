import {test} from 'node:test';
import {deepStrictEqual,ok} from 'node:assert';
import {cpSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {nativeHostInstrument,prepareNativeViewIdentity} from '@lapxo/bound/host';
import {capturedViews,cooled,configureHost,hosting} from '../src/ports/host.ts';
import {standingAt,words} from '../src/ports/bound.ts';
import {join} from 'node:path';
import {members,valueOf} from '../src/core/lock.ts';
import {born,line,lock,viewOf} from './place.ts';
import {readingOf,run} from './cli.ts';

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

test('no: the person-s birth file is an input bound reads, as every file of the place is — writing it moves bound-s identity, so it is never apart from head-s key and is written with a land, never while a fold runs',()=>{
 const p=born(undefined),id=()=>readingOf(run('@lapxo/bound',p.place,['fold','--as','reading-identity@lines']),'lines'),before=id();
 writeFileSync(join(p.place,valueOf(lock,'founding/birth-file')),`${line('lang','id','en')}\n`);
 ok(!('refused' in before)&&JSON.stringify(id())!==JSON.stringify(before),'the identity moved');
 ok(!members(valueOf(lock,'reading/apart')).includes(valueOf(lock,'founding/birth-file')),'reading/apart never names it');
});


const configured=()=>{configureHost(lock,{wait:Number(valueOf(lock,'bound/wait').split('..')[1]),most:Number(valueOf(lock,'bound/printed').split('..')[1])});Object.assign(words,Object.fromEntries(Object.keys(words).map(key=>[key,valueOf(lock,`bound/${key}`)])));};
const installed=dirname(createRequire(import.meta.url).resolve('@lapxo/bound/package.json'));
const bytesAt=(place:string)=>Object.fromEntries(readdirSync(place,{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile()).map(entry=>{const path=join(entry.parentPath,entry.name);return [path,createHash('sha256').update(readFileSync(path)).digest('hex')];}));

test('Head native batches equal public single-view results in the same actual context, with no persistent changes in two unrelated places',()=>{
 configured();
 try {for(const _ of [1,2]){
  const p=born(undefined),before=bytesAt(p.place),batch=capturedViews(p.place,['lines','evidence']);
  ok(batch?.kind==='fact',JSON.stringify(batch));if(batch?.kind!=='fact')continue;
  const instrument=nativeHostInstrument(installed,join(installed,'dist/cli/verb.js'));
  for(const result of batch.views)deepStrictEqual(result,prepareNativeViewIdentity({place:p.place,instrument,view:result.view,expectedIdentity:result.identity}));
  deepStrictEqual(bytesAt(p.place),before);
  for(const result of batch.views)deepStrictEqual(result.text.trim(),viewOf(p.place,result.view as 'lines'|'evidence').trim());
  deepStrictEqual(capturedViews(p.place,['lines','evidence']),batch,'the CLI fold journal is derived, not a semantic input');
  writeFileSync(join(p.place,valueOf(lock,'founding/birth-file')),`${line('lang','id','en')}\n`);
  const moved=capturedViews(p.place,['lines','evidence']);ok(moved?.kind==='refuse'||moved?.kind==='fact'&&moved.views[0]!.identity!==batch.views[0]!.identity);
 }}finally{cooled();}
});

test('a corrupted current authority ledger cannot be answered from Head retained parsed views',async()=>{
 configured();const p=born(undefined),read=()=>standingAt('@lapxo/bound',p.place,()=>[],()=>false);
 try {ok(!('refused'in await read()));
  const name=readdirSync(join(p.place,'.bound','ledger')).find(name=>name.endsWith('.bound')&&readFileSync(join(p.place,'.bound','ledger',name),'utf8').includes(' sig='));ok(name,'the altered signature exists');
  const ledger=join(p.place,'.bound','ledger',name!),held=readFileSync(ledger,'utf8'),changed=held.replace(/ sig=(\S)/,(_all,c)=>' sig='+(c==='a'?'b':'a'));ok(changed!==held);writeFileSync(ledger,changed);
  ok('refused'in await read(),'changed bytes without land never validate the retained result');
 }finally{cooled();}
});

test('native capture checks the installed digest on every call, including a descriptor retained between calls',()=>{
 configured();const p=born(undefined),copy=join(mkdtempSync(join(tmpdir(),'head-native-copy-')),'bound');cpSync(installed,copy,{recursive:true});
 try {
  ok(capturedViews(p.place,['lines'],undefined,copy)?.kind==='fact');
  const file=join(copy,'README.md');writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from('\nchanged') ]));
  const changed=capturedViews(p.place,['lines'],undefined,copy);ok(changed?.kind==='refuse'&&changed.code==='host/instrument-pin');
  const correct=hosting.installed;hosting.installed='sha256:'+'0'.repeat(64);
  try{const mismatch=capturedViews(p.place,['lines']);ok(mismatch?.kind==='refuse'&&mismatch.code==='host/instrument-pin');}finally{hosting.installed=correct;}
  deepStrictEqual(capturedViews(p.place,['lines'],AbortSignal.abort()),undefined);
 }finally{cooled();rmSync(dirname(copy),{recursive:true,force:true});}
});
