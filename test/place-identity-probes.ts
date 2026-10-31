import { rootIn } from '../src/flows/device.ts';
import { placeOf } from '../src/core/answer.ts';
import { valueOf, type Said } from '../src/core/lock.ts';
import type { Context } from '../src/core/answer.ts';
/** Port-level characterization; reports current alias/choice behavior; native signature checks are separate. */
export async function placeIdentity(lock: readonly Said[]) {
  const place = '/fixture/documents', home = '/fixture/home', family = valueOf(lock, 'home/family');
  const index = { lines: [{ scope: `${family}/reports`, measure: 'id', value: place }] };
  const standing = { lines: [{ scope: valueOf(lock, 'founding/root'), measure: 'public-key', value: 'synthetic-public' }] };
  const context = { lock, home: () => home, files: { has: (dir: string) => dir === home || dir === place }, keys: { held: (account: string) => account === 'place/reports/root' ? 'synthetic-public' : undefined }, policy: async (dir: string) => dir === home ? index : standing, roots: async () => [] } as unknown as Context;
  const name = await rootIn(context, place), alias = await rootIn(context, place + '/.');
  const ambiguous = { ...context, files: { has: () => true }, roots: async () => ['/fixture/first', '/fixture/second'] } as unknown as Context;
  const first = await placeOf({}, ambiguous), reversed = await placeOf({}, { ...ambiguous, roots: async () => ['/fixture/second', '/fixture/first'] });
  const ordinary = { ...context, files: { has: () => false }, roots: async () => ['/fixture/public-documents'] } as unknown as Context;
  return { node: process.versions.node, matchingAuthenticatedNameUsesIndexedAccount: 'account' in name && name.account === 'place/reports/root', ordinaryDocumentRootIsNotAPlace: await placeOf({}, ordinary) === undefined, explicitPlacePreserved: await placeOf({ place }, ambiguous) === place, aliasEquivalentPathRefused: 'said' in alias, ambiguousRootChoiceDependsOnOrder: first !== reversed && first === '/fixture/first', authorityExpanded: false, probeType: 'Isolated port fixtures; not a native signature or real-keychain proof', openFindings: [...('said' in alias ? ['F07-alias'] : []), ...(first !== reversed ? ['F07-ambiguity'] : [])] };
}
