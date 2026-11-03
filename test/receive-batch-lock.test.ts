import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
test('installed OS guard survives a killed Head and excludes another process with a different TMPDIR and canonical alias', async()=>{
 const entry=process.env['HEAD_BATCH_PORT'];assert.ok(entry,'installed receiving port required');
 const root=mkdtempSync(join(tmpdir(),'head-batch-lock-')), parent=join(root,'real'), alias=join(root,'alias');mkdirSync(parent);symlinkSync(parent,alias);const oneTmp=join(root,'one'),twoTmp=join(root,'two');mkdirSync(oneTmp);mkdirSync(twoTmp);
 const source=`import{receivingAt}from${JSON.stringify(pathToFileURL(entry).href)};await receivingAt(process.argv[1],async()=>{console.log('held');await new Promise(r=>process.stdin.once('data',r))},5000);`;
 const child=spawn(process.execPath,['--input-type=module','-e',source,join(parent,'place')],{stdio:['pipe','pipe','pipe'],env:{...process.env,TMPDIR:oneTmp}});
 try{
  await new Promise<void>((resolve,reject)=>{child.once('error',reject);child.stdout.once('data',bytes=>bytes.toString().trim()==='held'?resolve():reject(Error('fixture startup')));});
  const attempt=()=>spawnSync(process.execPath,['--input-type=module','-e',`import{receivingAt}from${JSON.stringify(pathToFileURL(entry).href)};await receivingAt(process.argv[1],async()=>console.log('entered'),5000);`,join(alias,'place')],{encoding:'utf8',timeout:6000,env:{...process.env,TMPDIR:twoTmp}});
  const busy=attempt();assert.notEqual(busy.status,0);assert.match(busy.stderr,/receive\/busy/);
  const closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));child.kill('SIGKILL');await closed;
  const retried=attempt();assert.equal(retried.status,0,retried.stderr);assert.match(retried.stdout,/entered/);
 }finally{child.kill('SIGKILL');}
});
