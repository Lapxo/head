import { test } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';
import { typedAnswer } from '../src/flows/answer.ts';
import { lock } from './place.ts';
import type { Context } from '../src/core/answer.ts';
function fixture() {
  const calls: string[] = [];
  const context = { lock, files: { lay: (_p:string,path:string) => calls.push('lay:'+path), drop: (_p:string,path:string) => calls.push('drop:'+path) }, world: async (_place:string,view:string) => { calls.push('view:'+view); return {lines:[{scope:'answer/abc/content/0',measure:'text',value:'exact',at:'place:mcp-answer',by:'mcp',form:'alphabet',role:'reads'}]}; } } as unknown as Context;
  return { context, calls };
}
test('answer model: a compiled form selects only a registered recipient view and temporary bytes are removed',async()=>{
 const {context,calls}=fixture();const got=await typedAnswer(context,'/fixture',[{scope:'offers/source/tool/form',measure:'answer-view',value:'mcp-answer'},{scope:'view/mcp-answer',role:'demands',value:'mcp-answer@1'}],'source','tool','abc',Buffer.from('{}'));
 equal('lines'in got,true);equal(calls.filter(c=>c==='view:mcp-answer').length,1);equal(calls.filter(c=>c.startsWith('drop:')).length,1);
});
test('answer model: absent, conflicting and invalid model bindings refuse without reading or writing bytes',async()=>{
 for(const forms of [[{scope:'offers/source/tool/form',measure:'answer-view',value:'mcp-answer'}],[{scope:'offers/source/tool/form',measure:'answer-view',value:'first|second'}],[{scope:'offers/source/tool/form',measure:'answer-view',value:'../keys'}]]){
  const {context,calls}=fixture();equal('untyped'in await typedAnswer(context,'/fixture',forms,'source','tool','abc',Buffer.from('{}')),true);deepStrictEqual(calls,[]);
 }
});
test('answer model: a source without a model keeps the existing registered default',async()=>{
 const {context,calls}=fixture();await typedAnswer(context,'/fixture',[{scope:'view/answer',role:'demands',value:'answer@1'}],'source','tool','abc',Buffer.from('{}'));equal(calls.includes('view:answer'),true);
});
