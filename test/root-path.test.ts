import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { rootIn } from '../src/flows/device.ts';
import { valueOf } from '../src/core/lock.ts';
import { placeOf, placeNameOf, type Context } from '../src/core/answer.ts';
import { lockAt } from '../src/ports/place.ts';
import { run } from './cli.ts';
import { factsOf } from '../src/core/lock.ts';
import { born, line } from './place.ts';

const lock = lockAt(import.meta.dirname + '/..');
for (const subject of ['records', 'readings']) test(`indexed root path aliases preserve authenticated identity: ${subject}`, async () => {
  const p = born(undefined, [], null, false, subject, false, false);
  const home = born(undefined, [line(`${valueOf(lock,'home/family')}/${subject}`, 'id', p.place)], null, false, 'index', false, false);
  const policy: Context['policy'] = async dir => { const got = run('@lapxo/bound',dir,['fold','--as','lines']); return got?.code === 0 ? { lines: factsOf(got.out) } : { refused: 'fixture/authentication' }; };
  const held = await policy(p.place); assert.ok('lines' in held);
  const publicKey = held.lines.find(l=>l.scope===valueOf(lock,'founding/root')&&l.measure==='public-key')!.value;
  const account = `place/${subject}/root`;
  const context = { lock, home: () => home.place, files: { has: (dir:string,rel:string) => existsSync(join(dir,rel)) }, policy, keys: { held: (named:string) => named === account ? publicKey : undefined } } as unknown as Context;
  for (const path of [p.place, p.place+'/', p.place+'/.', p.place+'/../'+basename(p.place)]) assert.deepEqual(await rootIn(context,path), { account });
  // The public key in the authenticated place remains the check, even when an index locates an account.
  assert.ok('said' in await rootIn({...context, keys:{...context.keys,held:()=> 'another-public-key'}},p.place+'/.'));
  assert.ok('said' in await rootIn({...context, keys:{...context.keys,held:()=>undefined}},p.place+'/.'));
  assert.ok('said' in await rootIn({...context, policy:async()=>({refused:'fixture/refused'})},p.place+'/.'));
  const keyFile=join(p.place,'.bound/bound.keys'),before=readFileSync(keyFile);
  try { writeFileSync(keyFile,'invalid public anchor\n'); assert.ok('said' in await rootIn(context,p.place+'/.')); }
  finally { writeFileSync(keyFile,before); }
  assert.deepEqual(await rootIn(context,p.place+'/.'), { account });
  const duplicate = {...context, policy:async(dir:string)=>dir===home.place?{lines:[line(`${valueOf(lock,'home/family')}/other`,'id',p.place)].flatMap(l=>factsOf([l])).concat(factsOf([line(`${valueOf(lock,'home/family')}/${subject}`,'id',p.place)]))}:policy(dir)};
  assert.ok('said' in await rootIn(duplicate,p.place+'/.'));
  const legacy = {...context,policy:async(dir:string)=>dir===home.place?{lines:[]}:policy(dir),keys:{...context.keys,held:(name:string)=>name===`place/${basename(p.place)}/root`?publicKey:undefined}};
  assert.deepEqual(await rootIn(legacy,p.place+'/.'),{account:`place/${basename(p.place)}/root`});
});

test('explicit dot aliases retain distinct selected place names for access accounts', async () => {
  const context = { lock } as unknown as Context;
  const one = await placeOf({place:'/fixture/records/.'},context), two = await placeOf({place:'/fixture/readings/.'},context);
  assert.equal(one,'/fixture/records'); assert.equal(two,'/fixture/readings');
  assert.notEqual(placeNameOf(one!),placeNameOf(two!));
});
