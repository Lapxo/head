import{test}from'node:test';import{deepStrictEqual,equal,ok,throws}from'node:assert/strict';import{readFileSync}from'node:fs';
import{kindWords}from'./protocol-surface.ts';import{declaredOf,valueOf}from'../src/core/lock.ts';import{configuredProtocol,configuredBytes,configuredDocument,configuredPackage}from'../src/ports/adapters/configured.ts';import{fingerprint}from'../src/ports/adapters/mcp.ts';
const lock=declaredOf(readFileSync(new URL('../TARGET.bound',import.meta.url),'utf8')),words=valueOf(lock,'surface/kind-words/words').split('|');
test('kind boundary: imports, comments, identifiers and strings outside adapters remain visible for every declared kind',()=>{
 for(const word of words)for(const body of [`// ${word}`,`const ${word}Value = 1;`,`import '${word}';`,`const value='${word.toUpperCase()}';`]){equal(kindWords({'src/core/subject.ts':body},[],words).length>=1,true);deepStrictEqual(kindWords({'src/ports/adapters/subject.ts':body},['src/ports/adapters/subject.ts'],words),[]);}
 deepStrictEqual(kindWords({'src/core/ordinary.ts':'const value = 1;'},[],words),[]);
});
test('kind boundary: adapter descriptor is immutable and exposes protocol data without granting authority',()=>{
 ok(Object.isFrozen(configuredProtocol));throws(()=>{(configuredProtocol as {id:string}).id='other';},TypeError);equal(configuredProtocol.id,'mcp');
 const tools=[{name:'lookup',inputSchema:{type:'object' as const}}],configuration={protocol:'head-configured-mcp@1' as const,name:'catalogue',endpoint:'https://fixture.invalid/service',catalogue:fingerprint(tools).digest,offers:['lookup']},bytes=configuredBytes(configuration,tools),doc=configuredDocument(bytes)!;
 deepStrictEqual(doc.configuration,configuration);equal(configuredProtocol.connection(Buffer.from('{}'),'catalogue',false,{offers:'offers',class:'declares'}),undefined);
 for(const[source,overlay]of[['other',false],['catalogue',true]]as const)throws(()=>configuredProtocol.connection(bytes,source,overlay,{offers:'offers',class:'declares'}),/mcp\/document/);
 const bound=configuredProtocol.connection(bytes,'catalogue',false,{offers:'offers',class:'declares'})!;deepStrictEqual(bound.worlds,['topos-mcp']);throws(()=>bound.verify([]),/mcp\/tool-mapping/);bound.verify([{scope:'offers/catalogue/lookup',measure:'declares',value:'read-only'}]);
});
test('kind boundary: recipient validates each public document once and retains exactly the checked document data',()=>{
 const tools=[{name:'lookup',inputSchema:{type:'object' as const}}],configuration={protocol:'head-configured-mcp@1' as const,name:'catalogue',endpoint:'https://fixture.invalid/service',catalogue:fingerprint(tools).digest,offers:['lookup']},bytes=configuredBytes(configuration,tools);
 const docs=configuredPackage({} as never,new Map([['selected.json',bytes],['other.json',Buffer.from('{}')],['ignored.txt',Buffer.from('not a document')]]));equal(docs.length,1);deepStrictEqual(docs[0],configuredDocument(bytes));
 const invalid=JSON.parse(bytes.toString());invalid.configuration.headers={authorization:'private'};throws(()=>configuredPackage({} as never,new Map([['invalid.json',Buffer.from(JSON.stringify(invalid))]])),/mcp\/configuration/);
});
