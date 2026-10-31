import { test } from 'node:test';
import { strict as a } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { attachmentFor, principalOf, accessIdentity } from '../src/access/obtain.ts';
import { homeService, homeServices } from '../src/ports/home.ts';
import { publishFile, publishFolder } from '../src/ports/export.ts';
import { lockAt, layAt, canonicalPath } from '../src/ports/place.ts';
import { valueOf } from '../src/core/lock.ts';
import { shareBundle } from '../src/core/share-bundle.ts';
import { compose } from '../src/core/composition.ts';
import type { Context } from '../src/core/answer.ts';
import type { Call } from '../src/core/read.ts';
const lock = lockAt(import.meta.dirname + '/..');
for (const domain of ['instruments', 'documents']) {
  test(`${domain}: access is retained only after its native receipt; bindings separate roots, origins and audience`, async () => {
    const data = new Map<string,string>(); let obtains = 0, landings = 0, refused = true;
    const lines: any[] = [{ scope: valueOf(lock,'founding/root'), measure: 'public-key', value: `${domain}-root` }];
    const plan = { source: domain, origin: 'https://one.example', access: { account: `place/equal/api/${domain}`, kind: 'fixture', flow: `${domain}/token`, scheme: 'token', params: { audience: 'one' } } } as unknown as Call;
    const c = { lock, now: () => 1793380000000, keys: { read: (key:string) => data.get(key), write: (key:string,value:string) => {data.set(key,value);} }, access: async () => ({ attach: (secret:string) => ({ headers:{ authorization: secret }, query:{} }), obtain: async () => {obtains++; return {secret:'synthetic-token'};} }), landAs: async (_place:string,lot:string[]) => {landings++; if(refused) return {refused:'fixture/denied'}; const at=/ at=([^ ]+)/.exec(lot[0]!)![1];lines.push({scope:`${valueOf(lock,'access/family')}/${plan.access.flow}/obtained`,at,value:'present',about:'access-binding:sha256:'+accessIdentity(c,plan,lines)!.binding});return {lines:lot};}, elicit: async () => 'yes' } as unknown as Context;
    a.deepEqual(await attachmentFor(c, '/fixture/place', lines, plan), {said:'access-receipt-refused'});
    const identity=accessIdentity(c,plan,lines)!; a.equal(data.get(identity.account),undefined);a.equal(principalOf(c,plan,true,lines),undefined);
    a.deepEqual(await attachmentFor(c,'/fixture/place',lines,plan),{said:'access-attempt-pending'});a.equal(obtains,1);
    refused=false; const got=await attachmentFor(c,'/fixture/place',lines,plan,true);a.ok('attachment'in got);a.equal(obtains,2);a.equal(landings,2);
    a.ok(principalOf(c,plan,true,lines));await attachmentFor(c,'/fixture/place',lines,plan);a.equal(obtains,2);
    a.equal(principalOf(c,plan,true,lines.slice(0,1)),undefined,'a removed receipt cannot support a cached principal');a.deepEqual(await attachmentFor(c,'/fixture/place',lines.slice(0,1),plan),{said:'access-attempt-pending'});a.equal(obtains,2,'a missing receipt cannot cause an automatic external retry');
    const other={...plan,origin:'https://two.example'};a.notEqual(accessIdentity(c,other,lines)!.account,identity.account);a.equal(principalOf(c,other,true,lines),undefined);a.notEqual(accessIdentity(c,{...plan,origin:'https://one.example/production'},lines)!.account,accessIdentity(c,{...plan,origin:'https://one.example/staging'},lines)!.account,'different server paths cannot silently share a credential');
    a.notEqual(accessIdentity(c,{...plan,access:{...plan.access,params:{audience:['two']}}},lines)!.binding,identity.binding);
    a.notEqual(accessIdentity(c,plan,[{...lines[0],value:'other-root'}])!.binding,identity.binding);
  });
  test(`${domain}: canonical home namespaces and explicitly approved compatible legacy lookup do not move keys`, async () => {
    const dir=mkdtempSync(join(tmpdir(),'head-home-scope-')), one=join(dir,'a/home'),two=join(dir,'b/home');mkdirSync(one,{recursive:true});mkdirSync(two,{recursive:true});
    try { const first=homeServices('head',one),second=homeServices('head',two);a.notEqual(first.primary,second.primary);a.equal(first.legacy,second.legacy);
      const records=new Map<string,Map<string,string>>(), publicKeys=new Map<string,Map<string,string>>([[first.legacy,new Map([['place/home/root','root']])]]);
      const store=(service:string)=>({held:(account:string)=>publicKeys.get(service)?.get(account),read:(account:string)=>records.get(service)?.get(account),write:(account:string,value:string)=>{if(!records.has(service))records.set(service,new Map());records.get(service)!.set(account,value);}});
      a.equal(await homeService('head',one,undefined,store,async()=>'no'),first.primary);
      const expected=new Map([['place/home/root','root']]);await a.rejects(homeService('head',one,expected,store,async()=>'no'),/home\/approval/);
      a.equal(await homeService('head',one,expected,store,async()=>'yes'),first.legacy);
      a.equal(await homeService('head',one,expected,store,async()=>{throw Error('must not ask again');}),first.legacy);
      await a.rejects(homeService('head',two,expected,store,async()=>'yes'),/home\/namespace/);
      await a.rejects(homeService('head',two,new Map([['place/home/root','unrelated']]),store,async()=>'yes'),/home\/identity/);
      a.deepEqual([...publicKeys.get(first.legacy)!],[['place/home/root','root']]);
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
  test(`${domain}: export publishes complete bytes without replacing targets or following child symlinks`, () => {
    const dir=mkdtempSync(join(tmpdir(),'head-export-scope-')),root=join(dir,'root'),outside=join(dir,'outside');mkdirSync(root);mkdirSync(outside);writeFileSync(join(outside,'sentinel'),'safe');
    try {symlinkSync(outside,join(root,'escape'),'dir');a.throws(()=>publishFile([root],join(root,'escape','sentinel'),Buffer.from('bad')));a.throws(()=>layAt(root,'escape/sentinel',Buffer.from('bad')));a.equal(readFileSync(join(outside,'sentinel'),'utf8'),'safe');
      const to=join(root,`${domain}-é.mcpb`);publishFile([root],to,Buffer.from('complete'));a.equal(readFileSync(to,'utf8'),'complete');a.throws(()=>publishFile([root],to,Buffer.from('replace')));a.equal(readFileSync(to,'utf8'),'complete');
      a.throws(()=>publishFile([root],join(outside,'new'),Buffer.from('bad')));a.equal(existsSync(join(outside,'new')),false);
      const folder=join(root,'package');publishFolder([root],folder,new Map([['nested/public.json',Buffer.from('{}')],['TARGET.bound',Buffer.from('lock')]]),'TARGET.bound');a.equal(readFileSync(join(folder,'TARGET.bound'),'utf8'),'lock');a.throws(()=>publishFolder([root],folder,new Map(),'TARGET.bound'));
      const bad=join(root,'bad');a.throws(()=>publishFolder([root],bad,new Map([['../escape',Buffer.from('bad')]]),'TARGET.bound'));a.equal(existsSync(bad),false);
      a.equal(canonicalPath(root+'/.'),canonicalPath(root));
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
}
test('all-source share requires public metadata, never emits an empty base, and checks current bytes before publication', async () => {
  const hash='sha256:'+'1'.repeat(64), doc='sha256:'+'2'.repeat(64), source={name:'records',kind:'compiled',document:doc,pin:hash,offers:['read']};let publications=0,packs=0;
  const bytes=Buffer.from(`bound-lock/1 at=policy:fixture by=target form=alphabet measure=digest role=writes scope=uses/records value=${hash}\nbound-lock/1 at=policy:fixture by=target form=alphabet measure=digest role=writes scope=sources/records value=${doc}\n`), files=new Map([['TARGET.bound',bytes]]);
  const c={lock,roots:async()=>[],files:{has:()=>false,publish:async()=>{publications++;}},bundle:async(payload:any)=>{packs++;a.deepEqual(payload.recipe.sources,[{source:'records',namespace:'records',offers:['read']}]);return{bytes:Buffer.from('package'),digest:hash,sources:['records']};}}as unknown as Context;
  const read=async()=>({files,sources:[source]});
  a.ok((await shareBundle({place:'/fixture/place',to:'/fixture/place/output.mcpb'},c,read))![0]!.includes('bundle/metadata-required'));a.equal(packs,0);
  const incomplete=await shareBundle({place:'/fixture/private-customer-folder',to:'/fixture/private-customer-folder/output.mcpb',args:JSON.stringify({author:{name:'Neutral author'}})},c,read);a.ok(incomplete![0]!.includes('bundle/metadata-required'));a.ok(!incomplete!.join('\n').includes('private-customer-folder'));a.equal(packs,0);
  const args=JSON.stringify({id:'records',revision:'1.0.0',title:'Records',description:'Public sources',author:{name:'Neutral author'}});a.ok((await shareBundle({place:'/fixture/place',to:'/fixture/place/output.mcpb',args},c,read))![0]!.includes('head/bundle-shared'));a.equal(publications,1);
  let reads=0;const changed=async()=>({files:++reads===1?files:new Map([['TARGET.bound',Buffer.from('changed')]]),sources:[source]});a.ok((await shareBundle({place:'/fixture/place',to:'/fixture/place/output2.mcpb',args},c,changed))![0]!.includes('bundle/source-changed'));a.equal(publications,1);
  a.throws(()=>compose({id:'records',revision:'1.0.0',title:'Records',description:'Public',author:{name:''},sources:[{source:'records',namespace:'records',offers:['read']}]},[source],64),/author/);
});

for (const subject of ['measurement', 'document']) test(`${subject}: two export processes cannot replace each other's output`, async () => {
  const { spawn } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'head-export-race-')), to = join(dir, 'shared.mcpb');
  const script = `import{publishFile}from ${JSON.stringify(new URL('../src/ports/export.ts',import.meta.url).href)};try{publishFile([process.argv[1]],process.argv[2],Buffer.from(process.argv[3]));}catch{process.exitCode=1;}`;
  const run = (body: string) => new Promise<number | null>((resolve, reject) => { const child = spawn(process.execPath, ['--input-type=module', '-e', script, dir, to, body], { stdio: 'ignore' }); child.once('error', reject); child.once('exit', code => resolve(code)); });
  try { const statuses = await Promise.all([run('first complete payload'),run('second complete payload')]); a.deepEqual(statuses.sort(),[0,1]);a.ok(['first complete payload','second complete payload'].includes(readFileSync(to,'utf8'))); }
  finally { rmSync(dir,{recursive:true,force:true}); }
});
