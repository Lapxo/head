import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { canonical, parse } from '@lapxo/topos/wire';
const hash = (bytes: Uint8Array | string) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const files = (base: string): string[] => readdirSync(base, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(base + '/' + entry.name) : [base + '/' + entry.name]).sort();
/** Version2 reviews the explicitly external-Node deployment; the former no-system-Node guarantee is historical. */
export function run(place: string) {
  const bytes = readFileSync('samples/standalone-runtime/yes/client.json');
  if (hash(bytes) !== 'sha256:2d8559daeb1a85a93f0983778f3628c08d0a21be9d13825def954d8fca152a96') throw Error('REFUSE·standalone/capture');
  const capture = JSON.parse(bytes.toString());
  if (capture.protocol !== 'head-system-node-capture@1' || capture.desktopUIAcceptance !== false || capture.ownerAdmitted !== false || capture.deployment !== 'requires-compatible-installed-node') throw Error('REFUSE·standalone/protocol');
  for (const input of capture.inputs) if (hash(readFileSync(input.path)) !== input.sha256) throw Error('REFUSE·standalone/current-input');
  for (const base of ['src', 'dist/src']) if (JSON.stringify(files(base)) !== JSON.stringify(capture.inputs.filter((input: { path: string }) => input.path.startsWith(base + '/')).map((input: { path: string }) => input.path).sort())) throw Error('REFUSE·standalone/inventory');
  const policy = readFileSync('TARGET.bound', 'utf8').split('\n').map(line => parse(line)).flatMap(row => row.kind === 'fact' && capture.policyScopes.includes(row.value.fields.scope) ? [row.value.fields] : []);
  if (hash(policy.map(({ at, by, epoch, sig, ...fields }) => canonical(fields)).sort().join('\n')) !== capture.policy) throw Error('REFUSE·standalone/policy');
  const inventory = JSON.parse(readFileSync('runtime.bundle.json', 'utf8')), manifest = JSON.parse(readFileSync('manifest.json', 'utf8')), pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (existsSync('runtime/node') || inventory.protocol !== 'head-runtime-closure@1' || inventory.execution !== undefined || inventory.files.some((m: {path: string}) => m.path.startsWith('runtime/')) || pkg.bundleDependencies !== undefined || manifest.server.type !== 'node' || manifest.compatibility.runtimes.node !== '>=22.18') throw Error('REFUSE·standalone/external-runtime');
  if (hash(readFileSync('runtime.bundle.json')) !== capture.installed.runtimeDescriptor || !capture.installed.allArchiveMembersIdentical || !capture.installed.allRequiredRuntimeMembersVerified || !capture.installed.cleanInstall || !capture.installed.offline || capture.installed.installScripts || capture.installed.NodeBundled) throw Error('REFUSE·standalone/installed');
  if (capture.runs.length !== 2 || capture.runs.map((r: {node:string}) => r.node).sort().join('|') !== '22|24') throw Error('REFUSE·standalone/runtimes');
  for (const run of capture.runs) {
    for (const [name, count] of [['focused',24],['complete',3]] as const) if (!new RegExp('^(?:# |ℹ )pass '+count+'$', 'm').test(run[name]) || !/^(?:# |ℹ )fail 0$/m.test(run[name])) throw Error('REFUSE·standalone/controls');
    if (!run.electronSimulated || run.hostExecPath !== '/unlaunchable/host-helper' || run.realDesktop || !run.missingAndIncompatibleNodeRefused || !run.privateErrorOutputExcluded || !run.environmentSanitized) throw Error('REFUSE·standalone/relaunch');
  }
  const positive = place.replace(/\/$/, '') === 'samples/standalone-runtime/yes';
  return (positive ? ['runtime/standalone', 'keys/no-replacement'] : ['standalone/current-inputs']).map(scope => ({ scope, role: 'writes', measure: 'defects', bound: { kind: 'interval' as const, lo: 0, hi: 0 } }));
}
