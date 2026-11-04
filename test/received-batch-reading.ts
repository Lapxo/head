import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const hash = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
/** Recorded installed executions remain evidence; current neutral guard assertions execute natively on every changed input. */
export function run(place: string) {
  const bytes = readFileSync('samples/received-batch/yes/client.json');
  if (hash(bytes) !== 'sha256:5b128b7c5babc5de51f2e143ece849d9749e6cfbd2eed41bc5c4fb95acd381f3') throw Error('REFUSE·receive/capture');
  const c = JSON.parse(bytes.toString());
  if (c.protocol !== 'head-received-batch-capture@1' || c.scientificState !== 'evidence' || c.privateApiUsed || c.privateOpenAPIIncluded || c.capacityClosed || c.singleConsentBeforeCommitRecoveryClosed || c.runs.length !== 2) throw Error('REFUSE·receive/evidence');
  for (const input of c.inputs) if (hash(readFileSync(input.path)) !== input.sha256) throw Error('REFUSE·receive/current-input');
  const sources = readdirSync('src', { recursive: true, withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.ts')).map(e => e.parentPath + '/' + e.name).sort();
  if (JSON.stringify(sources) !== JSON.stringify(c.inputs.filter((i: {path:string}) => i.path.startsWith('src/')).map((i:{path:string})=>i.path).sort())) throw Error('REFUSE·receive/inventory');
  if (c.runs.map((r:{node:string})=>r.node.split('.')[0]).sort().join('|') !== '22|24') throw Error('REFUSE·receive/runtimes');
  for (const r of c.runs) if (r.results.length !== 5 || r.results.some((x:{check:string})=>x.check!=='PASS closed') || r.results.filter((x:{case:string})=>x.case==='installed-full').some((x:{compilations:number;prompts:number})=>x.compilations!==1||x.prompts!==1) || r.results.find((x:{case:string})=>x.case==='two-real-processes')?.second!=='receive/busy') throw Error('REFUSE·receive/consumer');
  const vector = JSON.parse(readFileSync('vectors/received-batch/cases.json','utf8'));
  const child = spawnSync(process.execPath, ['--test','--test-reporter=tap','dist/test/receive-batch-guards.test.js'], { encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:5000, maxBuffer:1048576, killSignal:'SIGKILL' });
  const names = child.stdout?.split('\n').flatMap(line => /^ok \d+ - (.*)$/.exec(line)?.[1] ?? []);
  if (child.status!==0 || child.signal || child.error || !/^# pass 10$/m.test(child.stdout) || !/^# fail 0$/m.test(child.stdout) || JSON.stringify(names)!==JSON.stringify(vector.cases)) throw Error('REFUSE·receive/guard-tests');
  return [{scope: place.replace(/\/$/,'')==='vectors/received-batch'?'receiver/batch-component-defects':'receiver/batch-current-inputs',role:'writes',measure:'defects',bound:{kind:'interval' as const,lo:0,hi:0}}];
}
