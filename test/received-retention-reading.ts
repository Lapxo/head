import {run as verifyRuntimeProbes} from './runtime-probes-reading.ts';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
/** Run the same neutral assertions against current modules; no recorded success substitutes for execution. */
export function run(place: string) {
  verifyCurrentRevalidation();
  if (place.replace(/\/$/, '') !== 'vectors/received-retention') return [{ scope: 'retention/current-inputs', role: 'writes', measure: 'defects', bound: { kind: 'interval' as const, lo: 0, hi: 0 } }];
  const vector = JSON.parse(readFileSync('vectors/received-retention/cases.json', 'utf8'));
  if (vector.protocol !== 'head-received-retention@1' || vector.cases.length !== 14) throw Error('REFUSE·retention/vector');
  const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'dist/test/received-retention.test.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, maxBuffer: 1048576, killSignal: 'SIGKILL' });
  const names = child.stdout?.split('\n').flatMap(line => /^ok \d+ - (.*)$/.exec(line)?.[1] ?? []);
  if (child.error || child.signal || child.status !== 0 || !/^# pass 14$/m.test(child.stdout) || !/^# fail 0$/m.test(child.stdout) || !/^# skipped 0$/m.test(child.stdout) || JSON.stringify(names) !== JSON.stringify(vector.cases)) throw Error('REFUSE·retention/tests');
  return [{ scope: 'receiver/retention-defects', role: 'writes', measure: 'defects', bound: { kind: 'interval' as const, lo: 0, hi: 0 } }];
}

/** Verify the reviewed fresh revalidation while its consumed production and fixture bytes remain current. */
export function verifyCurrentRevalidation() {
  if (!verifyRuntimeProbes('samples/runtime-probes/yes').some(r=>r.scope==='runtime/probe-selection')) throw Error('REFUSE·retention/runtime-probes');
  const bytes = readFileSync('samples/received-retention/yes/current.json');
  const digest = (value: Uint8Array) => 'sha256:' + createHash('sha256').update(value).digest('hex');
  if (digest(bytes) !== 'sha256:8bfb1cc30b5b7e53f42cf5f722907185c0e22392882763629732b462b2615ba3') throw Error('REFUSE·retention/revalidation-pin');
  const c = JSON.parse(bytes.toString());
  if (c.protocol !== 'head-retention-revalidation@1' || c.runs.length !== 2 || c.runs.map((run: {node: string}) => run.node).sort().join('|') !== '22|24' || c.privateApiUsed || c.privateOpenAPIIncluded) throw Error('REFUSE·retention/revalidation');
  for (const input of c.inputs) if (digest(readFileSync(input.path)) !== input.sha256) throw Error('REFUSE·retention/revalidation-input');
  for (const run of c.runs) {
    if (!/^(?:# |ℹ )pass 14$/m.test(run.retentionUnitOutput) || !/^(?:# |ℹ )fail 0$/m.test(run.retentionUnitOutput) || !/^(?:# |ℹ )pass 1$/m.test(run.partialReceiveOutput) || !/^(?:# |ℹ )fail 0$/m.test(run.partialReceiveOutput) || !/^(?:# |ℹ )pass 1$/m.test(run.firstMinuteOutput) || !/^(?:# |ℹ )fail 0$/m.test(run.firstMinuteOutput)) throw Error('REFUSE·retention/revalidation-tests');
    if (run.mcpFullFlow.runs.length !== 2 || run.mcpFullFlow.runs.some((d: {withinExistingTimeCeilings: boolean; timeFailures: unknown[]}) => !d.withinExistingTimeCeilings || d.timeFailures.length) || run.installedShare.results.length !== 2 || run.installedShare.credentialsUsed || run.installedShare.externalApiCalled || run.installedShare.results.some((d: {exportedTwice: boolean; realRuntimeByteCorruptionRefused: boolean; privateCanaryAbsent: boolean}) => !d.exportedTwice || !d.realRuntimeByteCorruptionRefused || !d.privateCanaryAbsent)) throw Error('REFUSE·retention/revalidation-consumer');
  }
}
