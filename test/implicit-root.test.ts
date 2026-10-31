import { test } from 'node:test';
import { strict as a } from 'node:assert';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { placeOf, inPlace, homeIndex, type Context } from '../src/core/answer.ts';
import { rootIn } from '../src/flows/device.ts';
import { bornAt } from '../src/places/found.ts';
import { asked } from '../src/verbs/ask.ts';
import { done } from '../src/verbs/do.ts';
import { connected } from '../src/sources/connect.ts';
import { factsOf, valueOf } from '../src/core/lock.ts';
import { lockAt } from '../src/ports/place.ts';
import { born, line } from './place.ts';
import { run } from './cli.ts';
const lock = lockAt(import.meta.dirname + '/..');
for (const subject of ['measurements', 'documents']) test(`implicit selection and index refusal are independent of shared-root order: ${subject}`, async () => {
  const one = born(undefined, [], null, false, subject, false, false), two = born(undefined, [], null, false, subject + '-other', false, false);
  const family = valueOf(lock, 'home/family'), index = (entries: readonly [string,string][]) => born(undefined, entries.map(([name,path]) => line(`${family}/${name}`, 'id', path)), null, false, 'index', false, false);
  const single = index([['custom-name',one.place]]), multiple = index([['custom-name',one.place],['other-name',two.place]]), duplicate = index([['custom-name',one.place],['another-name',one.place]]), invalid = index([['custom-name','relative/place']]);
  const policy: Context['policy'] = async dir => {const got=run('@lapxo/bound',dir,['fold','--as','lines']);return got?.code===0?{lines:factsOf(got.out)}:{refused:'fixture/authentication'};};
  let actions = 0;
  const context = (home: string, roots: readonly string[] = [two.place,one.place]) => ({lock,home:()=>home,files:{has:(dir:string,rel:string)=>existsSync(join(dir,rel)),read:{describedAt:async()=>{actions++;throw Error('Discovery must not run after refusal');}},lay:()=>{actions++;},drop:()=>{actions++;}},roots:async()=>roots,policy,keys:{held:()=>{actions++;return undefined;},made:()=>{actions++;return undefined;}},elicit:async()=>{actions++;return 'yes';},device:()=>{actions++;return undefined;},personal:()=>one.place} as unknown as Context);
  for (const roots of [[one.place,two.place],[two.place,one.place]]) {
    a.equal(await placeOf({},context(single.place,roots)),one.place);
    const ambiguous=await placeOf({},context(multiple.place,roots));a.ok(typeof ambiguous==='object'&&ambiguous.said[0]?.startsWith('said/head/place-ambiguous '));
    a.equal(await placeOf({place:two.place+'/.'},context(multiple.place,roots)),two.place);
    a.equal(await placeOf({},context(one.place+'/absent-index',roots)),undefined);
  }
  const orphan=join(one.place,'orphan-index');mkdirSync(join(orphan,'.bound'),{recursive:true});
  for(const [home,code]of [[orphan,'index-unread'],[invalid.place,'index-invalid']]as const){
    const c=context(home),before=actions,selection=await placeOf({},c);a.ok(typeof selection==='object'&&selection.said[0]?.startsWith('said/head/'+code+' '));
    a.ok((await inPlace({},c,async()=>{actions++;return[];}))[0]?.startsWith('said/head/'+code+' '));
    a.ok((await asked({card:'true'},c))[0]?.startsWith('said/head/'+code+' '));
    a.ok((await done({action:'share'},c))[0]?.startsWith('said/head/'+code+' '));
    a.ok((await connected({source:'fixture',document:'https://fixture.invalid'},c))[0]?.startsWith('said/head/'+code+' '));
    a.ok((await connected({place:one.place,source:'fixture',document:'https://fixture.invalid'},c))[0]?.startsWith('said/head/'+code+' '));
    a.ok((await bornAt(c,join(one.place,'new-place'),'new-place'))[0]?.startsWith('said/head/'+code+' '));
    a.ok('said'in await rootIn(c,one.place));a.equal(actions,before,'No prompt, key access, creation or write after index refusal');a.ok(!existsSync(join(one.place,'new-place')));
  }
  const anchor=join(single.place,'.bound/bound.keys'),original=readFileSync(anchor);try{writeFileSync(anchor,'corrupt public anchor\n');const c=context(single.place),r=await placeOf({},c);a.ok(typeof r==='object'&&r.said[0]?.includes('head/index-unread'));a.ok((await bornAt(c,join(one.place,'not-founded'),'not-founded'))[0]?.includes('head/index-unread'));a.ok(!existsSync(join(one.place,'not-founded')));}finally{writeFileSync(anchor,original);}
  a.equal(await placeOf({},context(single.place)),one.place);
  const account=await rootIn(context(duplicate.place),one.place);a.ok('said'in account&&account.said[0]?.startsWith('said/head/place-ambiguous '));
  const withdrawn={...context(single.place),policy:async()=>({lines:factsOf([line(`${family}/gone`,'id','withdraw')])})}as Context;a.equal(await placeOf({},withdrawn),undefined);
  a.ok('lines'in await homeIndex(context(one.place+'/never-founded')));
});
