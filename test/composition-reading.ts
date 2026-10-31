import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const digest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
interface Capture { protocol: string; inputs: { path: string; sha256: string }[]; runs: { node: string; output: string }[] }
/** Retain the reviewed regional matrix only while every producer input still has its reviewed bytes. */
export function run(place: string) {
  const bytes = readFileSync('samples/composition/yes/client.json');
  if (digest(bytes) !== 'sha256:f0eac832086794a121fa886b7ffdee08224eee35a693196f089110f7b896bb76') throw Error('REFUSE·composition capture');
  const capture = JSON.parse(bytes.toString()) as Capture;
  if (capture.protocol !== 'head-composition-reviewed-vectors@1' || capture.runs.length !== 2) throw Error('REFUSE·composition protocol');
  const nodes = new Set<string>();
  for (const run of capture.runs) {
    if (!['22', '24'].includes(run.node) || nodes.has(run.node) || !/^(?:# |ℹ )pass 7$/m.test(run.output) || !/^(?:# |ℹ )fail 0$/m.test(run.output)
      || !/^(?:# |ℹ )skipped 0$/m.test(run.output) || !/^(?:# |ℹ )cancelled 0$/m.test(run.output)) throw Error('REFUSE·composition incomplete vectors');
    nodes.add(run.node);
  }
  for (const input of capture.inputs) if (digest(readFileSync(input.path)) !== input.sha256) throw Error(`REFUSE·composition current input ${input.path}`);
  return (place.replace(/\/$/, '') === 'samples/composition/yes' ? ['selection-vector', 'mcp-port-vector', 'mcpb-format-vector'] : ['current-inputs'])
    .map(name => ({ scope: `composition/${name}`, role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }));
}
