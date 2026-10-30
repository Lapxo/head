import{test}from'node:test';import{deepStrictEqual,ok}from'node:assert/strict';import{readFileSync}from'node:fs';import{sdkOwners,clientWords,type ProtocolRules}from'./protocol-surface.ts';
const rules=JSON.parse(readFileSync(new URL('../docs/contracts/protocol-surface.json',import.meta.url),'utf8')) as ProtocolRules,owner=rules.paginationOwner;
const valid=`import { Client as Session } from '@modelcontextprotocol/sdk/client/index.js';
const client = new Session({name:'head',version:'0'});
async function page(after){const got=await client.listTools(after?{cursor:after}:{});return got.nextCursor;}`;
test('protocol SDK ownership: one physical owner, incoming/outgoing roles and no extra or hidden SDK references',()=>{
 const incoming=`import{Server}from'@modelcontextprotocol/sdk/server/index.js';`;
 const got=sdkOwners({[owner]:incoming+'\n'+valid},rules);deepStrictEqual(got.owners,[owner]);deepStrictEqual(got.issues,[]);
 for(const files of [{'src/ports/third.ts':incoming},{'src/index.ts':incoming},{'src/index.ts':valid},{[owner]:`const m=await import('@modelcontextprotocol/sdk/client/index.js');`},{[owner]:`const p='@modelcontextprotocol/sdk/client/index.js';`},{'src/ports/third.ts':`// @modelcontextprotocol/sdk`}] as Record<string,string>[])ok(sdkOwners(files,rules).issues.length>0);
});
test('protocol pagination: aliases and standard SDK labels are allowed only in their exact adapter and call/result context',()=>{
 deepStrictEqual(clientWords({[owner]:valid},rules),[]);
 for(const text of[`const cursor='editor';`,`const note='cursor';`,`// Cursor product`,`const unknown={cursor:'value'};`,`const got={};got.nextCursor;`,`const client={listTools(){}};async function page(){const got=await client.listTools({cursor:'x'});return got.nextCursor;}`,`import{Client as Session}from'@modelcontextprotocol/sdk/client/index.js';async function run(Session){const client=new Session();const got=await client.listTools({cursor:'x'});return got.nextCursor;}`,valid.replace('{cursor:after}', '{nested:{cursor:after}}'),valid.replace('const client','let client'),valid.replace('const got','let got'),valid+`\nconst example='cursor';`,valid+`\nconst desktop='product';`])ok(clientWords({[owner]:text},rules).length>0,text);
 ok(clientWords({'src/core/elsewhere.ts':valid},rules).some(x=>x.endsWith(': cursor')));
});
test('protocol forbidden products: every other forbidden word remains forbidden in either SDK role',()=>{
 for(const word of rules.clientWords)for(const path of ['src/index.ts',owner,'src/core/elsewhere.ts'])ok(clientWords({[path]:`const value='${word}';`},rules).length>0);
});
