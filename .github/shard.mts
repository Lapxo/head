// The test files of shard <i> of <n>: every file of test/*.test.ts in exactly one shard, the heaviest first onto the
// lightest shard, by the seconds each took when it was last measured (.github/test-weights.json). A file never measured
// weighs as the median one, so no file is ever left out of every shard.
// usage: node .github/shard.mts <i> <n>
import { readdirSync, readFileSync } from 'node:fs';

const [index, n] = process.argv.slice(2).map(Number) as [number, number];
const weights = JSON.parse(readFileSync(new URL('./test-weights.json', import.meta.url), 'utf8')) as Record<string, number>;
const files = readdirSync('test').filter((f) => f.endsWith('.test.ts')).map((f) => `test/${f}`).sort();
const known = files.flatMap((f) => (weights[f] === undefined ? [] : [weights[f]!])).sort((a, b) => a - b);
const weight = (f: string) => weights[f] ?? known[known.length >> 1] ?? 1;
const shards = Array.from({ length: n }, () => ({ load: 0, files: [] as string[] }));
for (const f of [...files].sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : 1))) {
  const lightest = shards.reduce((least, one) => (one.load < least.load ? one : least));
  lightest.files.push(f); lightest.load += weight(f);
}
if (!(index >= 1 && index <= n)) throw Error(`shard ${index} of ${n} does not exist`);
console.log(shards[index - 1]!.files.join(' '));
