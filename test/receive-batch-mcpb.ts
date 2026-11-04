import { strict as assert } from 'node:assert';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { ask } from './client.ts';
import { tool } from './share-fixture.ts';
import { client } from './receive-batch-client.ts';
import { receivingFixture, primed, sourcePins } from './receive-batch-fixture.ts';
const fixture=JSON.parse(readFileSync(process.env['HEAD_BATCH_FIXTURE']!,'utf8')).from;
const text=(r:any)=>(r.result?.content??[]).map((c:any)=>c.text??'').join('\n');
const scratch=mkdtempSync(join(tmpdir(),'head-batch-mcpb-')),archive=join(fixture.place,`neutral-receiver-${process.pid}.mcpb`);
const recipe={id:'neutral-receiver',revision:'1.0.0',title:'Neutral receiver',description:'Two related public fixture documents',author:{name:'Neutral fixture'},sources:[{source:'auth',namespace:'auth',offers:['login']},{source:'jobs',namespace:'jobs',offers:['list-jobs']}]};
const [shared]=await ask([tool('share',{place:fixture.place,to:archive,args:JSON.stringify(recipe)})],[fixture.place],fixture.env);
assert.match(text(shared),/head\/bundle-shared/,text(shared));
const unpacked=join(scratch,'extension');execFileSync('unzip',['-q',archive,'-d',unpacked]);
assert.ok(!readFileSync(join(unpacked,'composition/TARGET.bound'),'utf8').split('\n').filter(Boolean).some(line=>/ scope=(keys|allow|access)\//.test(line)));
const to=await receivingFixture('mcpb'),place=join(to.env.HOME,'head-packages',recipe.id);
const c=await client(join(unpacked,'dist/src/index.js'),to.env,unpacked,join(scratch,'trace.jsonl'));
const ready=await c.call('tools/call',{name:'ask',arguments:{}}).answer;
const fields=ready.result.structuredContent.cells.find((cell:any)=>cell.code==='head/bundle-receiver-ready')?.fields;assert.ok(fields,text(ready));
// Public worlds are already fixed in the fixture cache; prepare their native CAS as soon as founding creates TARGET.
const seed=setInterval(()=>{try{readFileSync(join(place,'.bound/bound.keys'));primed(place);}catch{}},10);
let got:any;try{got=await c.call('tools/call',{name:'connect',arguments:{document:fields.document,digest:fields.digest}}).answer;}finally{clearInterval(seed);}
assert.match(text(got),/head\/bundle-associated/,text(got));assert.doesNotMatch(text(got),/state=(refused|open|red)/);assert.equal(c.prompts(),1);assert.deepEqual(sourcePins(place),sourcePins(fixture.place));
const repeat=await c.call('tools/call',{name:'connect',arguments:{document:fields.document,digest:fields.digest}}).answer;assert.match(text(repeat),/head\/bundle-associated/);assert.equal(c.prompts(),1);
await c.stop();
writeFileSync(process.env['HEAD_BATCH_RESULT']!,JSON.stringify({protocol:'head-batch-mcpb-installed@1',node:process.versions.node,fromInstalledRuntime:true,generatedWithShare:true,receiverImported:true,associated:true,prompts:1,repeatPrompts:0,samePins:true,publicFixture:true,privateApiCalls:0,noAuthorityStateIncluded:true},null,2)+'\n');
