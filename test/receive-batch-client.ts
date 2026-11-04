import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { offline } from './worlds.ts';

export const until = async (test: () => boolean, wait = 30000) => {
  const end = Date.now() + wait;
  while (!test()) { if (Date.now() > end) throw Error('fixture condition timed out'); await pause(10); }
};
export async function client(entry: string, env: Record<string,string>, root: string, trace: string) {
  writeFileSync(trace, '');
  const child = spawn(process.execPath, [entry, 'run'], { stdio: ['pipe','pipe','pipe'], env: { ...process.env, ...offline(), ...env, HEAD_RECEIVE_TRACE: trace, NODE_OPTIONS: offline().NODE_OPTIONS + ' --import ' + new URL('./receive-batch-trace.ts', import.meta.url).pathname } });
  let buffer = '', prompts = 0, serial = 0, stderr = '';
  const waiting = new Map<number,{resolve:(x:any)=>void,reject:(x:Error)=>void}>();
  const send = (value: unknown) => child.stdin.write(JSON.stringify(value)+'\n');
  child.stdin.on('error',()=>undefined);
  const closed = new Promise<void>(resolve => child.once('close',()=>{ for(const w of waiting.values()) w.reject(Error('client/closed')); waiting.clear(); resolve(); }));
  child.stderr.on('data', bytes => { stderr += bytes; if(stderr.length>1048576) child.kill('SIGKILL'); });
  child.stdout.on('data', bytes => {
    buffer += bytes;
    for(let i=buffer.indexOf('\n');i>=0;i=buffer.indexOf('\n')) {
      const msg=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);
      if(msg.method==='elicitation/create') { prompts++;send({jsonrpc:'2.0',id:msg.id,result:{action:'accept',content:{yes:true}}}); }
      else if(msg.method==='roots/list') send({jsonrpc:'2.0',id:msg.id,result:{roots:[{uri:pathToFileURL(root).href}]}});
      else if(msg.id!==undefined) {const w=waiting.get(msg.id);if(w){waiting.delete(msg.id);w.resolve(msg);}}
    }
  });
  const call=(method:string,params:any) => { const id=++serial; const answer=new Promise<any>((resolve,reject)=>{waiting.set(id,{resolve,reject});send({jsonrpc:'2.0',id,method,params});});return {id,answer}; };
  await call('initialize',{protocolVersion:'2025-11-25',capabilities:{roots:{},elicitation:{form:{}}},clientInfo:{name:'neutral-receiver',version:'1'}}).answer;
  send({jsonrpc:'2.0',method:'notifications/initialized'});
  return { call, prompts:()=>prompts, trace:()=>readFileSync(trace,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)), stderr:()=>stderr,
    cancel:(id:number)=>send({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:id,reason:'fixture cut'}}),
    stop:async()=>{child.kill('SIGTERM');await closed;}, kill:async()=>{child.kill('SIGKILL');await closed;}, pid:child.pid };
}
