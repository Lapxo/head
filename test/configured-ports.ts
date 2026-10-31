import{readFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';
import{parse}from'@lapxo/topos/wire';
const hash=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
/** Reviewed local prerequisite evidence only; no live remote connection or full recipient integration is certified. */
export function run(place:string){
 const bytes=readFileSync('samples/configured-ports/yes/client.json');if(hash(bytes)!=='sha256:397d562182f29f7fef1f2e0ca6ff1c73aab89dd01e2b5e6462cfd0e179c9561a')throw Error('REFUSE·configured capture');const capture=JSON.parse(bytes.toString());
 for(const input of capture.inputs)if(hash(readFileSync(input.path))!==input.sha256)throw Error('REFUSE·configured current input '+input.path);
 const current=readdirSync('src',{recursive:true,withFileTypes:true}).filter(e=>e.isFile()&&e.name.endsWith('.ts')).map(e=>e.parentPath+'/'+e.name).sort(),held=capture.inputs.filter((i:{path:string})=>i.path.startsWith('src/')).map((i:{path:string})=>i.path).sort();if(JSON.stringify(current)!==JSON.stringify(held))throw Error('REFUSE·configured source inventory');
 if(capture.protocol!=='head-configured-ports-capture@1'||capture.runs.length!==2||new Set(capture.runs.map((r:{node:string})=>r.node)).size!==2)throw Error('REFUSE·configured runtimes');
 for(const r of capture.runs)if(!['22','24'].includes(r.node)||!/^(?:# |ℹ )pass 10$/m.test(r.ports)||!/^(?:# |ℹ )fail 0$/m.test(r.ports)||!/^(?:# |ℹ )pass 4$/m.test(r.binding)||!/^(?:# |ℹ )fail 0$/m.test(r.binding)||!/^(?:# |ℹ )pass 14$/m.test(r.surface)||!/^(?:# |ℹ )fail 0$/m.test(r.surface)||r.native.length!==2||r.native.some((n:{strictCheck:boolean;staleReplayCannotOverwrite:boolean;noSourcePermissionGranted:boolean})=>!n.strictCheck||!n.staleReplayCannotOverwrite||!n.noSourcePermissionGranted))throw Error('REFUSE·configured incomplete vectors');
 const fields=readFileSync('TARGET.bound','utf8').split('\n').map(p=>parse(p)).flatMap(p=>p.kind==='fact'?[p.value.fields]:[]);if(!capture.policySnapshots?.some((policy:{sourceLines:string;coreLines:string;SDKImporters:string})=>[['source/lines',policy.sourceLines],['core/lines',policy.coreLines],['surface/sdk-importers',policy.SDKImporters]].every(([scope,value])=>fields.filter(f=>f.scope===scope&&f.form==='interval'&&f.value===value).length===1)))throw Error('REFUSE·configured capacity snapshot');
 return[{scope:place.replace(/\/$/,'')==='samples/configured-ports/yes'?'configured/prerequisite-ports':'configured/current-inputs',role:'writes',measure:'defects',bound:{kind:'interval' as const,lo:0,hi:0}}];
}
