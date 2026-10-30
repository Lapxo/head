import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { matches } from '@lapxo/topos/wire';
import { join } from 'node:path';
import { declaredOf, valueOf } from '../src/core/lock.ts';
import { sdkOwners, clientWords, kindWords, type ProtocolRules } from './protocol-surface.ts';
const digest = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const row = (scope: string, measure: string, value: number) => ({ scope, role: 'writes', measure, bound: { kind: 'interval', lo: value, hi: value } });
/** Read fresh source bytes using the same classifier as the production-surface tests; Bound judges the numerical ceilings. */
export function run(place: string) {
  const bytes = readFileSync('docs/contracts/protocol-surface.json'), lock = declaredOf(readFileSync('TARGET.bound', 'utf8'));
  for (const module of ['protocol-surface', 'protocol-surface-reading']) if (digest(readFileSync('dist/test/' + module + '.js')) !== valueOf(lock, 'dep/runtime-' + module)) throw Error('REFUSE·protocol-surface current reader bytes ' + module);
  for (const [path, scope] of [['node_modules/typescript/package.json', 'dep/protocol-surface-parser-manifest'], ['node_modules/typescript/lib/typescript.js', 'dep/protocol-surface-parser']]) if (digest(readFileSync(path!)) !== valueOf(lock, scope!)) throw Error('REFUSE·protocol-surface current parser bytes ' + path);
  if (digest(bytes) !== valueOf(lock, 'dep/protocol-surface-contract')) throw Error('REFUSE·protocol-surface contract digest');
  const rules = JSON.parse(bytes.toString('utf8')) as ProtocolRules;
  if (rules.clientWords.join('|') !== valueOf(lock, 'surface/client-words/words')) throw Error('REFUSE·protocol-surface forbidden-name catalogue');
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);
  const sources = Object.fromEntries(files('src').sort().map(path => [path, readFileSync(path, 'utf8')]));
  const sdk = sdkOwners(sources, rules), words = clientWords(sources, rules);
  const selectors = valueOf(lock, 'region/adapters').split('|'), kinds = valueOf(lock, 'surface/kind-words/words').split('|');
  if (!selectors.every(Boolean) || !kinds.every(Boolean)) throw Error('REFUSE·protocol-surface missing kind policy');
  const misplaced = kindWords(sources, Object.keys(sources).filter(path => selectors.some(selector => matches(selector, path))), kinds);
  if (sdk.issues.length) throw Error('REFUSE·protocol-surface ' + sdk.issues.join('; '));
  return place.replace(/\/$/, '') === 'src' ? [row('surface/sdk-importers', 'count', sdk.owners.length), row('surface/client-words', 'count', words.length), row('surface/kind-words', 'count', misplaced.length)] : [row('protocol-surface/current-inputs', 'defects', 0)];
}
