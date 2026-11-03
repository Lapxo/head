import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { client, until } from './receive-batch-client.ts';
import { receivingFixture, sourcePins } from './receive-batch-fixture.ts';
import { valueOf, declaredOf } from '../src/core/lock.ts';
import { lockAt } from '../src/ports/place.ts';
import { run } from './cli.ts';
const entry=process.env['HEAD_ENTRY']; assert.ok(entry,'installed entry required');
const fixture=JSON.parse(readFileSync(process.env['HEAD_BATCH_FIXTURE']!,'utf8')).from;
const document=join(fixture.pkg,'TARGET.bound'), digest=fixture.digest, expected=sourcePins(fixture.place);
const view=valueOf(lockAt(new URL('..',import.meta.url).pathname),'place/view');
const output=mkdtempSync(join(tmpdir(),'head-batch-installed-'));
const results:any[]=[];
const args=(place:string)=>({name:'connect',arguments:{place,document,digest}});
const text=(r:any)=>(r.result?.content??[]).map((c:any)=>c.text??'').join('\n');
const check=(place:string)=>{const c=run('@lapxo/bound',place,['fold','--check']);assert.equal(c?.code,0,c?.err.join('\n'));};
for(const domain of ['warehouse','observatory']) {
 const to=await receivingFixture(domain), c=await client(entry,to.env,fixture.pkg,join(output,domain+'.jsonl'));
 const start=performance.now(), got=await c.call('tools/call',args(to.place)).answer;
 assert.match(text(got),/head\/received/);assert.doesNotMatch(text(got),/state=(refused|open)/);
 assert.deepEqual(sourcePins(to.place),expected); assert.equal(c.prompts(),1);
 const compilations=c.trace().filter(x=>x.verb==='fold'&&x.args?.includes(view)).length;
 assert.equal(compilations,1,JSON.stringify(c.trace()));
 const rows=declaredOf(readFileSync(join(to.place,'TARGET.bound'),'utf8')).filter(l=>expected.some(([scope]:string[])=>l.scope===scope)&&l.value!=='withdraw');
 assert.equal(new Set(rows.map(l=>l.epoch)).size,1,'source pins admitted together');
 await c.stop();check(to.place);
 results.push({case:'installed-full',domain,sources:expected.length,prompts:1,compilations,seconds:(performance.now()-start)/1000,check:'PASS closed'});
}
for(const stage of ['before-commit','after-commit']) {
 const to=await receivingFixture('cut'),c=await client(entry,to.env,fixture.pkg,join(output,stage+'.jsonl'));
 const pending=c.call('tools/call',args(to.place));const interrupted=pending.answer.catch(()=>undefined);
 if(stage==='before-commit') await until(()=>c.trace().some(x=>x.verb==='fold'&&x.args?.includes(view)));
 else await until(()=>sourcePins(to.place).length===expected.length);
 await c.kill(); await interrupted;
 const countAfterCut=sourcePins(to.place).length;
 if(stage==='before-commit')assert.equal(countAfterCut,0);else assert.equal(countAfterCut,expected.length);
 const next=await client(entry,to.env,fixture.pkg,join(output,stage+'-retry.jsonl'));
 const got=await next.call('tools/call',args(to.place)).answer;assert.match(text(got),/head\/received/);assert.doesNotMatch(text(got),/state=(refused|open|red)/);
 assert.deepEqual(sourcePins(to.place),expected);await next.stop();check(to.place);
 results.push({case:'cut-and-reenter',stage,pinsAfterCut:countAfterCut,retryPrompts:next.prompts(),check:'PASS closed'});
}
{
 const to=await receivingFixture('concurrent'),one=await client(entry,to.env,fixture.pkg,join(output,'one.jsonl')),two=await client(entry,to.env,fixture.pkg,join(output,'two.jsonl'));
 const pending=one.call('tools/call',args(to.place));
 await until(()=>one.trace().some(x=>x.verb==='fold'&&x.args?.includes(view)));
 const busy=await two.call('tools/call',args(to.place)).answer;assert.match(text(busy),/receive\/busy/);assert.equal(two.prompts(),0);
 const done=await pending.answer;assert.match(text(done),/head\/received/);await one.stop();
 const retry=await two.call('tools/call',args(to.place)).answer;assert.match(text(retry),/head\/received/);assert.equal(two.prompts(),0);
 await two.stop();assert.deepEqual(sourcePins(to.place),expected);check(to.place);
 results.push({case:'two-real-processes',second:'receive/busy',retryPrompts:0,check:'PASS closed'});
}
const result={protocol:'head-receive-batch-installed@1',node:process.versions.node,installedEntry:entry,results,privateApiCalls:0,realKeychain:false,BoundModified:false};
writeFileSync(process.env['HEAD_BATCH_RESULT']!,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
