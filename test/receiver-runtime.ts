import { run as verifyRuntimeInventory } from './runtime-inventory.ts';
import{readFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';import{parse}from'@lapxo/topos/wire';
const hash=(x:Uint8Array)=>'sha256:'+createHash('sha256').update(x).digest('hex');
/** Reuse reviewed regional observations only while every current declared input is byte-identical. Capacity remains independently judged. */
export function run(place:string){
  verifyRuntimeInventory('dependency/runtime-inventory');
 const bytes=readFileSync('samples/receiver-runtime/yes/client.json');if(hash(bytes)!=='sha256:35f567feb671ae54a325c6711bee55c87dc454e1c11ced6d2b168e8439acf4bc')throw Error('REFUSE·receiver/capture');const c=JSON.parse(bytes.toString());
 for(const i of c.inputs)if(hash(readFileSync(i.path))!==i.sha256)throw Error('REFUSE·receiver/current-input');
 const current=readdirSync('src',{recursive:true,withFileTypes:true}).filter(e=>e.isFile()&&e.name.endsWith('.ts')).map(e=>e.parentPath+'/'+e.name).sort();if(JSON.stringify(current)!==JSON.stringify(c.inputs.filter((i:{path:string})=>i.path.startsWith('src/')).map((i:{path:string})=>i.path).sort()))throw Error('REFUSE·receiver/source-inventory');
 if(c.protocol!=='head-bundle-receiver-capture@1'||c.runs.length!==2||c.runs.map((r:{node:string})=>r.node).sort().join('|')!=='22|24')throw Error('REFUSE·receiver/runtimes');
 for(const r of c.runs)if(r.importCalls!==0||!r.privateCanaryAbsent||Object.keys(r.checks).length!==7||Object.values(r.checks).some(v=>v!==true))throw Error('REFUSE·receiver/vector');
 const fields=readFileSync('TARGET.bound','utf8').split('\n').map(p=>parse(p)).flatMap(p=>p.kind==='fact'?[p.value.fields]:[]);if(!c.policySnapshots?.some((policy:{source:string;core:string;doors:string;SDK:string})=>[['source/lines',policy.source],['core/lines',policy.core],['doors/lines',policy.doors],['surface/sdk-importers',policy.SDK]].every(([scope,value])=>fields.filter(f=>f.scope===scope&&f.form==='interval'&&f.value===value).length===1)))throw Error('REFUSE·receiver/policy');
 return[{scope:place.replace(/\/$/,'')==='samples/receiver-runtime/yes'?'composition/receiver-runtime':'composition/receiver-current-inputs',role:'writes',measure:'defects',bound:{kind:'interval' as const,lo:0,hi:0}}];
}
