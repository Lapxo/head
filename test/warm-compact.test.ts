import{test}from'node:test';
import{deepStrictEqual,ok}from'node:assert';
import{mkdtempSync,writeFileSync,existsSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{kept,warmed,cooled,warmth}from'../src/ports/warm.ts';

test('compact static imports preload before a request; the entry runs only when asked',async()=>{
 const root=mkdtempSync(join(tmpdir(),'head-compact-warm-')),program=join(root,'entry.js');
 writeFileSync(join(root,'package.json'),'{"type":"module"}');
 writeFileSync(join(root,'value.js'),"import{writeFileSync}from'node:fs';writeFileSync(new URL('prepared',import.meta.url),'ready');export const value=7;");
 writeFileSync(program,"import{value}from'./value.js';import{writeFileSync}from'node:fs';writeFileSync(new URL('executed',import.meta.url),'yes');console.log(value);");
 const before={...warmth};Object.assign(warmth,{spares:1,boot:[]});
 try{await kept(program);ok(existsSync(join(root,'prepared')));ok(!existsSync(join(root,'executed')));const result=await warmed(program,[],{cwd:root,env:{...process.env}},{wait:5000,most:65536});ok(result);deepStrictEqual([result.code,result.out],[0,['7']]);}
 finally{cooled();Object.assign(warmth,before);rmSync(root,{recursive:true,force:true})}
});
