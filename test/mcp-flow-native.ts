import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ok, equal } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { headOf } from '../src/doors/head.ts';
import { lockAt } from '../src/ports/place.ts';
import { declaredOf, valueOf } from '../src/core/lock.ts';
import { networkFor } from '../src/ports/adapters/network.ts';
import { fixture } from './mcp-fixture.ts';
import { fakeKeychain } from './fake-keychain.ts';
import { keep } from '../src/ports/cache.ts';
import { cooled } from '../src/ports/host.ts';

const candidate = process.env['MCP_NATIVE_RUNTIME'] ?? new URL('..', import.meta.url).pathname, lock = lockAt(candidate), hash = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const scratch = mkdtempSync(join(tmpdir(), 'head-mcp-native-')), shared = join(scratch, 'shared'); mkdirSync(shared);
const output = process.env['MCP_NATIVE_OUTPUT'];
const all: any[] = [], calls: any[] = [];
const worldPins = lock.filter(l => /^world\/[^/]+\/(standing|blob)$/.test(l.scope ?? '')).map(l => l.value!);
for (const digest of worldPins) { const bytes = readFileSync(join(tmpdir(), 'head-worlds', digest.slice(7))); equal(hash(bytes), digest); keep(bytes); }
const seed = (place: string) => { mkdirSync(join(place, '.bound/cas/blobs'), { recursive: true }); for (const digest of worldPins) writeFileSync(join(place, '.bound/cas/blobs', digest.slice(7)), readFileSync(join(tmpdir(), 'head-worlds', digest.slice(7)))); };
for (const domain of (process.env['MCP_NATIVE_DOMAINS'] ?? 'sum,lookup').split(',')) {
  const f = await fixture(domain, [{ name: domain + '-unselected', inputSchema: { type: 'object' } }, { name: domain + '-change', inputSchema: { type: 'object' } }]), network = (endpoint: string) => { equal(endpoint, f.endpoint); return networkFor(endpoint, { ca: f.ca.toString(), internal: [{ hostname: 'localhost', address: '127.0.0.1' }] }, (async () => [{ address: '127.0.0.1', family: 4 }]) as never); };
  const fake = fakeKeychain({}), home = join(scratch, domain + '-index'), place = join(shared, domain + '-sender'); Object.assign(process.env, fake.env, { HEAD_HOME: home });
  let allow = true; const prompts: any[] = [];
  const door = { can: () => ({ url: false, form: true }), elicit: async (params: any) => { prompts.push(params); return allow ? { action: 'accept', content: { yes: true } } : { action: 'decline' }; }, roots: async () => [shared], client: () => 'native-vector@1', name: 'mcp', network };
  const head = headOf(lock, candidate, '.ts', door);
  const call = async (verb: string, args: Record<string,string> = {}) => {
    const began = performance.now();
    let result: readonly string[] | undefined;
    if (['place','share','act'].includes(verb)) { const at = args['place'] ?? args['dir']; const card = await head.cardOf(at!); result = await head.call('do', { action: verb, ...args, card: 'card' in card ? card.card : '' }, new AbortController().signal); }
    else result = await head.call(verb, args, new AbortController().signal);
    const milliseconds = performance.now() - began; await head.idle(); calls.push({ domain, verb, result, milliseconds }); if (output) writeFileSync(output + '.calls.json', JSON.stringify(calls,null,2)+'\n'); return result?.join('\n') ?? '';
  };
  try {
    const born = await call('place', { dir: place }); ok(born.includes('head/born'), born.slice(0,2000)); seed(place); seed(home);
    const connected = await call('connect', { place, source: domain, document: f.endpoint, protocol: 'mcp' }); ok(connected.includes('head/connected'), connected.slice(0,3000)); equal(f.calls(), 0);
    const raw = readFileSync(join(place, 'connected', domain + '.json')); const doc = JSON.parse(raw.toString()); equal(doc.configuration.endpoint, f.endpoint);
    const pinBefore = readFileSync(join(place, 'TARGET.bound')); allow = false;
    const denied = await call('ask', { place, source: domain, operation: domain }); ok(!denied.includes('head/answered')); equal(f.calls(),0);
    allow = true; const read = await call('ask', { place, source: domain, operation: domain, args: JSON.stringify({ value: 7 }) }); ok(read.includes('head/answered') && read.includes(domain+':7'),read.slice(0,3500)); equal(f.calls(),1);
    if (process.env['MCP_NATIVE_MODE'] === 'read') { all.push({ domain, place, readTextVisible: true, milliseconds: calls.at(-1).milliseconds }); continue; }
    const changed = Buffer.from(raw); changed[changed.length - 2] = changed[changed.length - 2] === 32 ? 9 : 32; writeFileSync(join(place,'connected',domain+'.json'),changed);
    const stale = await call('ask', { place, source: domain, operation: domain, args: JSON.stringify({ value: 7 }) }); ok(stale.includes('mcp/document-pin'), stale.slice(0,2000)); equal(f.calls(),1); writeFileSync(join(place,'connected',domain+'.json'),raw);
    const recipe = { id: domain+'-desk', revision:'1.0.0', title:domain+' desk', description:'Selected public catalogue', author:{name:'Neutral fixture author'}, sources:[{source:domain,namespace:domain,offers:[domain, domain+'-change']}] };
    const bundle = join(shared, domain+'.mcpb');
    const exported = await call('share', { place, to: bundle, args: JSON.stringify(recipe) }); ok(exported.includes('head/bundle-shared') && existsSync(bundle), exported.slice(0,2500)); equal(f.calls(),1);
    const installed = join(scratch, domain+'-installed'); execFileSync('unzip',['-q',bundle,'-d',installed]);
    const receiverLock = lockAt(installed), receiverModule = await import(pathToFileURL(join(installed,'dist/src/doors/head.js')).href), receiverHost = await import(pathToFileURL(join(installed,'dist/src/ports/host.js')).href);
    const receiverHome = join(scratch,domain+'-receiver-index'), receiverPlace = join(scratch,domain+'-receiver-place');
    Object.assign(process.env, { HEAD_HOME: receiverHome });
    let receiverAllow = false; const receiverPrompts: any[] = [];
    const receiverDoor = { ...door, elicit: async (params: any) => { receiverPrompts.push(params); return receiverAllow ? { action:'accept',content:{yes:true} } : { action:'decline' }; } };
    let receiver = receiverModule.headOf(receiverLock,installed,'.js',receiverDoor);
    const receivedCall = async (verb:string,args:Record<string,string>={}) => { const began=performance.now(); let result; if(verb==='act'){ const card=await receiver.cardOf(receiverPlace); result=await receiver.call('do',{action:verb,...args,card:'card' in card?card.card:''},new AbortController().signal); } else result=await receiver.call(verb,args,new AbortController().signal); const milliseconds=performance.now()-began; await receiver.idle(); calls.push({domain,receiver:true,verb,result,milliseconds}); if(output)writeFileSync(output+'.calls.json',JSON.stringify(calls,null,2)+'\n'); return result?.join('\n')??''; };
    try {
      const ready=await receivedCall('ask');ok(ready.includes('head/bundle-receiver-ready'),ready.slice(0,2500));ok(!existsSync(receiverHome));equal(f.calls(),1);
      const publicLock=readFileSync(join(installed,'composition/TARGET.bound')), receive={document:join(realpathSync(installed),'composition/TARGET.bound'),digest:hash(publicLock),place:receiverPlace};
      const declined=await receivedCall('connect',receive);ok(declined.includes('head/no-yes'),declined);ok(!existsSync(receiverHome));ok(!existsSync(receiverPlace));equal(f.calls(),1);
      receiverAllow=true;
      // Fixture-only cache preload: after native foundation, supply the exact already-verified public world blobs. No receipts or policy are injected.
      const seeded=new Set<string>(), preload=setInterval(()=>{for(const at of [receiverPlace,receiverHome])if(!seeded.has(at)&&existsSync(join(at,'.bound'))){seed(at);seeded.add(at);}},5);
      let associated:string;try{associated=await receivedCall('connect',receive);}finally{clearInterval(preload);}
      ok(associated.includes('head/bundle-associated'),associated.slice(0,4000));equal(f.calls(),1,'recipient import invokes no tool');
      await receiverHost.cooled();receiver=receiverModule.headOf(receiverLock,installed,'.js',receiverDoor);
      const restart=await receivedCall('ask');ok(!restart.includes('head/bundle-receiver-ready'),restart.slice(0,2000));
      receiverAllow=false; const refused=await receivedCall('ask',{place:receiverPlace,source:domain,operation:domain,args:JSON.stringify({value:9})});ok(!refused.includes('head/answered'));equal(f.calls(),1);
      receiverAllow=true;const answer=await receivedCall('ask',{place:receiverPlace,source:domain,operation:domain,args:JSON.stringify({value:9})});ok(answer.includes('head/answered') && answer.includes(domain+':9'),answer.slice(0,3000));equal(f.calls(),2);
      const before=f.calls(), unselected=await receivedCall('act',{place:receiverPlace,source:domain,operation:domain+'-unselected'});ok(unselected.includes('head/bundle-not-selected'),unselected.slice(0,2200));equal(f.calls(),before);
      receiverAllow=false;const deniedAction=await receivedCall('act',{place:receiverPlace,source:domain,operation:domain+'-change'});equal(f.calls(),before);ok(!deniedAction.includes('head/answered'));
      receiverAllow=true;const action=await receivedCall('act',{place:receiverPlace,source:domain,operation:domain+'-change',args:JSON.stringify({value:3})});ok(action.includes('head/answered') && action.includes(domain+':3'),action.slice(0,3500));equal(f.calls(),before+1);
      f.drift(); const drift=await receivedCall('ask',{place:receiverPlace,source:domain,operation:domain,args:JSON.stringify({value:11})});ok(drift.includes('mcp/catalogue-changed'),drift.slice(0,2200));equal(f.calls(),before+1);
      const timeFailures = calls.filter(c => c.domain === domain).flatMap(c => (c.result ?? []).filter((line: string) => line.includes(' state=red ')).map((line: string) => ({side:c.receiver?'receiver':'sender',verb:c.verb,line})));
      all.push({timeFailures,withinExistingTimeCeilings:timeFailures.length===0,domain,place,receiverPlace,connected:true,denied:true,normalRead:true,currentByteRefusal:true,noCallDuringConnect:true,exportedMcpb:true,recipientInspectionInert:true,recipientDeclineNoWrites:true,recipientNativeFoundation:true,recipientImportNoInvocation:true,receiverOwnedAssociation:true,restartReusesAssociation:true,selectedRead:true,unselectedActionRefused:true,selectedActionConsent:true,catalogueDriftRefused:true,runtimeInventory:hash(readFileSync(join(installed,'runtime.bundle.json'))),artifact:hash(readFileSync(bundle)),worldCachePreloadedAfterFoundation:seeded.size,realDesktopInstall:false});
    } finally { receiverHost.cooled(); }
  } finally { cooled(); await head.idle(); await f.close(); }
}
if (output) writeFileSync(output,JSON.stringify({ protocol:'head-mcp-native-flow@1',node:process.versions.node,scratch,runs:all,RootChanged:false,ceilingsChanged:false,signed:false,published:false },null,2)+'\n');
console.log(JSON.stringify({scratch,runs:all}));
