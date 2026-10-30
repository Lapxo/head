import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { declaredOf } from '../src/core/lock.ts';
const hash = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
/** Report the actual reviewed transport success and unresolved response/timing failures; never promote a partial flow to zero. */
export function run(place: string) {
  const bytes = readFileSync('samples/mcp-receiver/yes/client.json');
  if (hash(bytes) !== 'sha256:32c21ca4a06694b78c998a86fdc33a06c1b1a29a620b5f648a491536621ced82') throw Error('REFUSE·mcp-receiver/capture');
  const capture = JSON.parse(bytes.toString());
  for (const input of capture.inputs) if (hash(readFileSync(input.path)) !== input.sha256) throw Error('REFUSE·mcp-receiver/current-input');
  const files = readdirSync('src', { recursive: true, withFileTypes: true }).filter(entry => entry.isFile() && entry.name.endsWith('.ts')).map(entry => entry.parentPath + '/' + entry.name).sort();
  if (JSON.stringify(files) !== JSON.stringify(capture.inputs.filter((input: any) => input.path.startsWith('src/')).map((input: any) => input.path).sort())) throw Error('REFUSE·mcp-receiver/source-inventory');
  const policy = declaredOf(readFileSync('TARGET.bound', 'utf8'));
  for (const selected of capture.policy) { const rows = policy.filter(row => row.scope === selected.scope); if (rows.length !== 1 || rows[0]!.value !== selected.value) throw Error('REFUSE·mcp-receiver/policy'); }
  if (capture.protocol !== 'head-mcp-receiver-capture@1' || capture.runs.length !== 2 || capture.runs.map((r: any) => r.node).sort().join('|') !== '22|24') throw Error('REFUSE·mcp-receiver/runtimes');
  for (const runtime of capture.runs) if (runtime.domains.length !== 2 || runtime.domains.some((domain: any) => capture.functionalChecks.some((key: string) => domain[key] !== true))) throw Error('REFUSE·mcp-receiver/transport');
  const visibility = capture.responseVisibility;
  if (visibility.cases.length !== 8 || visibility.defects !== visibility.cases.filter((one: any) => !one.visible).length) throw Error('REFUSE·mcp-receiver/visibility');
  const reading = (scope: string, measure: string, n: number) => ({ scope, role: 'writes', measure, bound: { kind: 'interval' as const, lo: n, hi: n } });
  return place.replace(/\/$/, '') === 'samples/mcp-receiver/yes' ? [reading('composition/mcp-receiver-transport', 'defects', 0), reading('composition/mcp-response-visibility', 'defects', visibility.defects), reading('answer/seconds', 'seconds', capture.measurements.maximumRedAnswerSeconds), reading('composition/mcp-receiver-latency', 'milliseconds', capture.measurements.maximumIsolatedMillisecondsRoundedUp)] : [reading('mcp-receiver/current-inputs', 'defects', 0)];
}
