import{test}from'node:test';import{strict as a}from'node:assert';import{createHash}from'node:crypto';import{observe}from'./source-lines.ts';import type{Said}from'../src/core/lock.ts';
const file=(name:string,n:number)=>{const bytes=Buffer.from('x\n'.repeat(n));return{name,bytes,digest:'sha256:'+createHash('sha256').update(bytes).digest('hex')}};
const policy=(name:string,measure:string,selector:string):Said[]=>[{scope:name+'/lines',form:'interval',measure,value:'0..120'},{scope:'region/'+name,measure:'coordinates',value:selector}];
for(const name of['warehouse','observatory']){
 test(name+': file-lines max is equivalent to checking every file, not summing',()=>{for(const counts of[[70,70],[121,1],[0,4]]){const rows=counts.map((n,i)=>file('src/'+name+'/'+i+'.ts',n)),read=observe(policy(name,'file-lines','src/'+name+'/**'),rows)[0]!;a.equal(read.bound.lo,Math.max(...counts));a.equal(read.bound.lo<=120,counts.every(n=>n<=120))}});
 test(name+': aggregate regions retain all physical lines',()=>{const rows=[file('src/'+name+'/a.ts',70),file('src/'+name+'/b.ts',70)];a.equal(observe(policy(name,name+'-lines','src/'+name+'/**'),rows)[0]!.bound.lo,140)});
 test(name+': ambiguous selectors, bad current digest and non-LF sources refuse',()=>{const p=policy(name,'file-lines','src/'+name+'/**'),row=file('src/'+name+'/a.ts',1);a.throws(()=>observe([...p,p[1]!],[row]));a.throws(()=>observe(p,[{...row,digest:'sha256:'+'0'.repeat(64)}]));a.throws(()=>observe(p,[{...row,bytes:Buffer.from('x')}]))});
}
