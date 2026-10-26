import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface Run { readonly node: string; readonly output: string }
interface Member { readonly path: string; readonly sha256: string }
interface Capture { readonly protocol: string; readonly artifact: { readonly sha256: string }; readonly runs: readonly Run[];
  readonly inputs: { readonly sources: readonly Member[]; readonly runtime: readonly Member[]; readonly onboarding: string; readonly lockfile: string } }
interface Timing { readonly scope: string; readonly ms: number }

/** Project reviewed local client-clock captures. The strict installed client vector enforces Head's unchanged ceilings.
 * This is evidence of the captured runs, never a claim of CI execution or independent-machine reproduction.
 * The native input identity commits the complete capture, including its artifact and producer bindings.
 */
export function observe(bytes: Uint8Array) {
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== 'sha256:23c4e23f5dada90f087f18e79d4322a875db7d6b0bae3b29d922649b45d1931b') throw Error('REFUSE·first-minute capture digest');
  const capture = JSON.parse(new TextDecoder().decode(bytes)) as Capture;
  if (capture.protocol !== 'head-first-minute-capture@1' || !/^sha256:[0-9a-f]{64}$/.test(capture.artifact?.sha256)
    || !Array.isArray(capture.runs) || capture.runs.length !== 2) throw Error('REFUSE·first-minute capture protocol');
  const scopes = ['chained', 'typed'].flatMap(way => ['new-without-source', 'new-with-source', 'repeated-with-receipt'].map(kind => `seconds/first-cell/${kind}/${way}`));
  const values = new Map<string, number>(), runtimes = new Set<string>();
  for (const run of capture.runs as readonly Run[]) {
    if (!['22', '24'].includes(run.node) || runtimes.has(run.node) || typeof run.output !== 'string') throw Error('REFUSE·first-minute runtimes');
    runtimes.add(run.node);
    if (!run.output.includes(`ENVIRONMENT node=v${run.node}.`) || !run.output.includes('clock=client-performance-now concurrency=one-timed-suite')
      || !/^(?:# |ℹ )fail 0$/m.test(run.output) || !/^(?:# |ℹ )pass 1$/m.test(run.output)) throw Error('REFUSE·first-minute incomplete run');
    const lines = run.output.split('\n').filter(line => line.includes('MEASURED exact-first-cell-ms '));
    if (lines.length !== 1) throw Error('REFUSE·first-minute measurement count');
    const rows = JSON.parse(lines[0]!.split('MEASURED exact-first-cell-ms ')[1]!) as Timing[];
    if (!Array.isArray(rows) || rows.length !== scopes.length || new Set(rows.map(row => row.scope)).size !== scopes.length) throw Error('REFUSE·first-minute cells');
    for (const row of rows) {
      if (!scopes.includes(row.scope) || !Number.isFinite(row.ms) || row.ms < 0 || row.ms > Number.MAX_SAFE_INTEGER) throw Error('REFUSE·first-minute measurement');
      values.set(row.scope, Math.max(values.get(row.scope) ?? 0, Math.ceil(row.ms)));
    }
  }
  return [...scopes.map(scope => ({ scope, role: 'writes', measure: 'milliseconds', bound: { kind: 'interval', lo: values.get(scope)!, hi: values.get(scope)! } })),
    { scope: 'first-minute/installed', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }];
}

/** Read-only binding of the current sources to the capture's measured artifact.
 * The installed runtime inventory was verified at capture time; this does not certify a successor archive.
 * No timestamps or size shortcuts. This reader does not rerun the client benchmark.
 */
export function run(place: string) {
  const bytes = readFileSync('samples/first-minute/yes/installed.json'), capture = JSON.parse(bytes.toString()) as Capture;
  const digest = (path: string) => `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
  const check = (dir: string, members: readonly Member[]) => {
    const current = readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name)).sort();
    if (!Array.isArray(members) || members.length !== current.length || new Set(members.map(member => member.path)).size !== members.length) throw Error('REFUSE·first-minute input inventory');
    for (const member of members) if (!current.includes(member.path) || digest(member.path) !== member.sha256) throw Error(`REFUSE·first-minute changed input ${member.path}`);
  };
  check('src', capture.inputs.sources);
  if (digest('test/onboarding.test.ts') !== capture.inputs.onboarding) throw Error('REFUSE·first-minute producer input changed');
  if (place.replace(/\/$/, '') !== 'samples/first-minute/yes') return [{ scope: 'first-minute/current-inputs', role: 'writes', measure: 'defects', bound: { kind: 'interval', lo: 0, hi: 0 } }];
  return observe(bytes);
}
