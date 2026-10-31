import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { canonical, parse } from '@lapxo/topos/wire';
const hash = (bytes: Uint8Array | string) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const files = (base: string): string[] => readdirSync(base, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(base + '/' + entry.name) : [base + '/' + entry.name]).sort();
/** Version3 adds real utilityProcess/MessagePort evidence; prior simulated-host runs stay historical. */
export function run(place: string) {
  const bytes = readFileSync('samples/standalone-runtime/yes/client.json');
  if (hash(bytes) !== 'sha256:4a98cca19788bb449a78f3df1c25580e47f89056f3b9dfbb4ef3eb660720b366') throw Error('REFUSE·standalone/capture');
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
  const bridge = capture.messagePortRevalidation;
  if (bridge?.protocol !== 'head-messageport-evidence@1' || bridge.realDesktop !== false || !bridge.RunAsNodeDisabled || bridge.electron !== '44.9.3' || !bridge.realUtilityProcess || !bridge.MessagePort || bridge.physicalOutputEvents !== 0 || bridge.fullFlowTests !== 3 || bridge.fullFlowFailures !== 0 || !/^# pass 3$/m.test(bridge.fullFlowOutput) || !/^# fail 0$/m.test(bridge.fullFlowOutput)) throw Error('REFUSE·standalone/messageport');
  if (!bridge.presence.initialized || !bridge.presence.unlinkedHomebrewOnly || bridge.presence.exit !== 0 || !bridge.missing.initialized || bridge.missing.toolResponses !== 3 || bridge.missing.cellsPerTool !== 1 || bridge.missing.childProcessCalls !== 0 || bridge.missing.writes !== 0 || !bridge.missing.HOMEUnchanged || bridge.missing.exit !== 0) throw Error('REFUSE·standalone/availability');
  if (bridge.focused.length !== 2 || bridge.focused.map((r: { node: string }) => r.node).sort().join('|') !== '22|24') throw Error('REFUSE·standalone/bridge-runtimes');
  for (const result of bridge.focused) if (!/^(?:# |ℹ )pass 8$/m.test(result.output) || !/^(?:# |ℹ )fail 0$/m.test(result.output)) throw Error('REFUSE·standalone/bridge-controls');
  if (bridge.historicalInheritRegression.expectedOutputBytes !== 262218 || bridge.historicalInheritRegression.actualOutputBytes !== 0 || !bridge.historicalInheritRegression.refused) throw Error('REFUSE·standalone/regression');
  const positive = place.replace(/\/$/, '') === 'samples/standalone-runtime/yes';
  return (positive ? ['runtime/standalone', 'keys/no-replacement'] : ['standalone/current-inputs']).map(scope => ({ scope, role: 'writes', measure: 'defects', bound: { kind: 'interval' as const, lo: 0, hi: 0 } }));
}
