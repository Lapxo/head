import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const digest = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
/** Project reviewed neutral tests only while their complete declared inputs remain byte-identical. */
export function run(place: string) {
  const bytes = readFileSync('samples/functional-repairs/yes/client.json');
  if (digest(bytes) !== 'sha256:33dda711d4527e447420b0b12f9dfe7c327bf50a03d41541df97302989954381') throw Error('REFUSE·functional-repairs/capture');
  const receipt = JSON.parse(bytes.toString());
  if (receipt.protocol !== 'head-functional-repairs-capture@1' || receipt.runs.length !== 2 || receipt.runs.map((r: { node: string }) => r.node).sort().join('|') !== '22|24') throw Error('REFUSE·functional-repairs/runtimes');
  for (const input of receipt.inputs) if (digest(readFileSync(input.path)) !== input.sha256) throw Error('REFUSE·functional-repairs/current-input');
  for (const run of receipt.runs) {
    if (!/^(?:# |ℹ )pass 9$/m.test(run.tests) || !/^(?:# |ℹ )fail 0$/m.test(run.tests) || /^not ok /m.test(run.tests)) throw Error('REFUSE·functional-repairs/incomplete');
    if (run.installed.domains.length !== 2 || run.installed.realAccountsUsed || run.installed.coverageWidened) throw Error('REFUSE·functional-repairs/consumer');
    for (const domain of run.installed.domains) if (!domain.consistentLocalPlaceName || !domain.wrongKeychainBlockedBeforeAuthority || !domain.accessReceiptObserved || !domain.credentialCanaryAbsentFromAnswers || !domain.credentialCanaryAbsentFromEvidence) throw Error('REFUSE·functional-repairs/receipt');
  }
  return [{ scope: place.replace(/\/$/, '') === 'samples/functional-repairs/yes' ? 'release/functional-repairs' : 'functional-repairs/current-inputs', role: 'writes', measure: 'defects', bound: { kind: 'interval' as const, lo: 0, hi: 0 } }];
}
