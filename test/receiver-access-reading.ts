import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse, canonical } from '@lapxo/topos/wire';
const hash = (bytes: Uint8Array | string) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
/** A review receipt for persistent local identity; repaired lexical aliases and open root choice remain separate findings. */
export function run(place: string) {
  const bytes = readFileSync('samples/receiver-access/yes/client.json');
  if (hash(bytes) !== 'sha256:fed375d86727b73075828cd0f8c6c28a10b4451f1ac0a8f7a328041dbcc3e3d5') throw Error('REFUSE·receiver-access/capture');
  const capture = JSON.parse(bytes.toString());
  for (const input of capture.inputs) if (hash(readFileSync(input.path)) !== input.sha256) throw Error('REFUSE·receiver-access/current-input');
  const fields = readFileSync('TARGET.bound', 'utf8').split('\n').filter(Boolean).map(line => parse(line)).flatMap(p => p.kind === 'fact' ? [p.value.fields] : []);
  const policy = fields.filter(f => capture.policyScopes.includes(f.scope)).map(({ at, by, epoch, sig, ...f }) => canonical(f)).sort().join('\n');
  if (hash(policy) !== capture.policy) throw Error('REFUSE·receiver-access/policy');
  if (capture.protocol !== 'head-receiver-persistent-access-capture@1' || capture.runs.length !== 2 || capture.runs.map((r: any) => r.node).sort().join('|') !== '22|24') throw Error('REFUSE·receiver-access/runtimes');
  for (const run of capture.runs) {
    if (!run.persistentKeychain || run.coverageWidened || run.productModified || run.realAccountsUsed || run.domains.length !== 2) throw Error('REFUSE·receiver-access/producer');
    for (const d of run.domains) {
      if (d.lexicalAliasCalls !== true || d.returnedCardFresh !== true || d.credentialMatchesOwnIssuer !== true) throw Error('REFUSE·receiver-access/alias-vector');
      if (d.importConsentCount !== 1 || d.importCalls !== 0 || d.loginCalls !== 3 || JSON.stringify(d.accessOrder) !== JSON.stringify(['origin', 'email', 'otp', 'workspaceId'])) throw Error('REFUSE·receiver-access/order');
      for (const key of ['restartedWithSameKeychain','admittedKeysUnchanged','rootAccountPublicMatches','senderDifferentNameAndFolderAuthenticated','selectedServerOnly','accessReceiptObserved','credentialReusedAcrossProcesses','freshWrongKeychainRefused','wrongKeychainBlockedBeforeAuthority','consistentLocalPlaceName','credentialCanaryAbsentFromAnswers','credentialCanaryAbsentFromEvidence','associatedPlaceAndListedDirectoryAgree']) if (d[key] !== true) throw Error('REFUSE·receiver-access/vector');
      if (d.accessReceiptKey !== 'head' || !d.accessReceiptScope?.startsWith('access/') || !d.accessReceiptScope.endsWith('/obtained')) throw Error('REFUSE·receiver-access/receipt');
    }
    if (!run.identity.matchingAuthenticatedNameUsesIndexedAccount || !run.identity.ordinaryDocumentRootIsNotAPlace || !run.identity.explicitPlacePreserved || run.identity.aliasEquivalentPathRefused !== false || run.identity.ambiguousRootChoiceDependsOnOrder || run.identity.authorityExpanded) throw Error('REFUSE·receiver-access/identity');
  }
  const reading = (scope: string, value: number) => ({ scope, role: 'writes', measure: 'defects', bound: { kind: 'interval' as const, lo: value, hi: value } });
  return place.replace(/\/$/,'') === 'samples/receiver-access/yes' ? [reading('receiver/access-persistent',0),reading('receiver/indexed-identity',0),reading('receiver/path-alias-defects',0)] : [reading('receiver-access/current-inputs',0)];
}
