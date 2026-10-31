import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { canonical, parse } from '@lapxo/topos/wire';
const hash = (bytes: Uint8Array | string) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const files = (base: string): string[] => readdirSync(base, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(base + '/' + entry.name) : [base + '/' + entry.name]).sort();
/** Review of executed installed consumers; no client execution or current installed-binary reading is implied. */
export function run(place: string) {
  const bytes = readFileSync('samples/standalone-runtime/yes/client.json');
  if (hash(bytes) !== 'sha256:37703c3eb08fd161ea5e7da602c9e54bceecf35d78cbb10c763d92cf45fa9ccf') throw Error('REFUSE·standalone/capture');
  const capture = JSON.parse(bytes.toString());
  if (capture.protocol !== 'head-standalone-runtime-capture@1' || capture.desktopUIAcceptance !== false || capture.ownerAdmitted !== false) throw Error('REFUSE·standalone/protocol');
  for (const input of capture.inputs) if (hash(readFileSync(input.path)) !== input.sha256) throw Error('REFUSE·standalone/current-input');
  for (const base of ['src', 'dist/src']) if (JSON.stringify(files(base)) !== JSON.stringify(capture.inputs.filter((input: { path: string }) => input.path.startsWith(base + '/')).map((input: { path: string }) => input.path).sort())) throw Error('REFUSE·standalone/inventory');
  const policy = readFileSync('TARGET.bound', 'utf8').split('\n').map(line => parse(line)).flatMap(row => row.kind === 'fact' && capture.policyScopes.includes(row.value.fields.scope) ? [row.value.fields] : []);
  if (hash(policy.map(({ at, by, epoch, sig, ...fields }) => canonical(fields)).sort().join('\n')) !== capture.policy) throw Error('REFUSE·standalone/policy');
  const inventory = JSON.parse(readFileSync('runtime.bundle.json', 'utf8')), provenance = JSON.parse(readFileSync('runtime.lock.json', 'utf8'));
  if (hash(readFileSync('runtime.bundle.json')) !== capture.installed.runtimeDescriptor || inventory.protocol !== 'head-runtime-closure@2' || capture.installed.archiveMembers < inventory.files.length || capture.installed.requiredMembersVerified !== inventory.files.length || capture.installed.archiveBytes <= 0 || !/^sha256:[a-f0-9]{64}$/.test(capture.installed.archiveSha256) || capture.installed.processNode !== provenance.version || !capture.installed.offline || capture.installed.installScripts || !capture.installed.cleanInstall) throw Error('REFUSE·standalone/installed');
  if (capture.runs.length !== 2 || capture.runs.map((run: { node: string }) => run.node).sort().join('|') !== '22|24') throw Error('REFUSE·standalone/runtimes');
  for (const run of capture.runs) {
    for (const [name, count] of [['keyPlatform', 13], ['runtime', 5]] as const) if (!new RegExp('^(?:# |ℹ )pass ' + count + '$', 'm').test(run[name]) || !/^(?:# |ℹ )fail 0$/m.test(run[name])) throw Error('REFUSE·standalone/controls');
    const recipient = run.recipient;
    if (recipient.archive !== capture.installed.baseDigest || recipient.childRuntime !== provenance.version || !recipient.persistentKeychain || recipient.coverageWidened || recipient.productModified || recipient.realAccountsUsed || !recipient.syntheticKeychain || recipient.domains.length !== 2 || new Set(recipient.domains.map((domain: { domain: string }) => domain.domain)).size !== 2) throw Error('REFUSE·standalone/recipient');
    for (const domain of recipient.domains) {
      if (domain.importConsentCount !== 1 || domain.importCalls !== 0 || domain.loginCalls !== 3 || JSON.stringify(domain.accessOrder) !== JSON.stringify(['origin', 'email', 'otp', 'workspaceId'])) throw Error('REFUSE·standalone/access');
      for (const key of ['lexicalAliasCalls', 'returnedCardFresh', 'credentialMatchesOwnIssuer', 'restartedWithSameKeychain', 'admittedKeysUnchanged', 'rootAccountPublicMatches', 'senderDifferentNameAndFolderAuthenticated', 'selectedServerOnly', 'accessReceiptObserved', 'credentialReusedAcrossProcesses', 'freshWrongKeychainRefused', 'wrongKeychainBlockedBeforeAuthority', 'consistentLocalPlaceName', 'credentialCanaryAbsentFromAnswers', 'credentialCanaryAbsentFromEvidence', 'associatedPlaceAndListedDirectoryAgree']) if (domain[key] !== true) throw Error('REFUSE·standalone/recipient-check');
      if (domain.accessReceiptKey !== 'head' || !domain.accessReceiptScope?.endsWith('/obtained')) throw Error('REFUSE·standalone/receipt');
    }
  }
  const positive = place.replace(/\/$/, '') === 'samples/standalone-runtime/yes';
  return (positive ? ['runtime/standalone', 'keys/no-replacement'] : ['standalone/current-inputs']).map(scope => ({ scope, role: 'writes', measure: 'defects', bound: { kind: 'interval' as const, lo: 0, hi: 0 } }));
}
