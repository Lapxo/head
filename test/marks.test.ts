import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { aboutOf, valueOf } from '../src/core/lock.ts';
import { lock } from './place.ts';
import { api, own, person } from './two-sources.ts';

/** Every mark an answer carries rests on the receipt of a read: as many receipts as marks, each a digest. */
const unevidenced = (got: readonly any[]): number => got.filter((c) => c.code.startsWith('head/agreed')).reduce((n, c) => n + Math.max(0, [...c.fields.marks].length - c.fields.receipts.split('|').filter((r: string) => /^sha256:[0-9a-f]{64}$/.test(r)).length), 0);

test('yes, over two places: two sources of their own that agree are marked by both, each mark resting on its read; nobody declared their lineage, so head does not know whether they are independent', async () => {
  for (const _ of [1, 2]) {
    const [a, b] = [await api(() => '{"temperature":21,"sky":"clear"}'), await api(() => '{"temperature":21,"sky":"clear"}')];
    try {
      const p = await person(a.document, b.document), got = await p.asked(), again = await p.asked(), read = p.receipts();
      for (const answer of [got, again]) deepStrictEqual(answer.map((c) => [c.code, c.fields.field, c.fields.value, c.fields.marks]).sort(), [['head/agreed-unknown', 'sky', 'clear', own + own], ['head/agreed-unknown', 'temperature', '21', own + own]]);
      deepStrictEqual(unevidenced(got), 0);
      deepStrictEqual([...got, ...again].flatMap((c) => c.fields.receipts.split('|')).filter((r: string) => !read.has(r)), [], 'each mark cites the receipt of a read the place holds, never the digest of what was kept, also when a new conversation is answered from it');
      ok(unevidenced(got) <= Number(valueOf(lock, 'marks-without-evidence').split('..')[1]));
    } finally { a.close(); b.close(); }
  }
});

test('no: two sources that differ are both shown, each with its value and hour, and the loss between them is not measured; none is picked, and what they agree on is still marked', async () => {
  const [a, b] = [await api(() => '{"temperature":21,"sky":"clear"}'), await api(() => '{"temperature":25,"sky":"clear"}')];
  try {
    const got = await (await person(a.document, b.document)).asked();
    deepStrictEqual(got.filter((c) => c.code === 'head/forked').map((c) => [c.fields.field, c.fields.source, c.fields.value]).sort(), [['temperature', 'forecast', '21'], ['temperature', 'mirror', '25']]);
    ok(got.filter((c) => c.code === 'head/forked').every((c) => !Number.isNaN(Date.parse(c.fields.at))) && got.some((c) => c.code === 'head/unmeasured' && c.fields.needs === valueOf(lock, 'marks/loss-needs')));
    ok(!got.some((c) => c.code.startsWith('head/agreed') && c.fields.field === 'temperature') && got.some((c) => c.code === 'head/agreed-unknown' && c.fields.field === 'sky'), JSON.stringify(got.map((c) => c.code)));
  } finally { a.close(); b.close(); }
});

test('missing fields are partial evidence, never disagreement with an absent assertion', async () => {
  const [a,b]=[await api(()=>'{"temperature":21}'),await api(()=>'{"sky":"clear"}')];
  try {const got=await (await person(a.document,b.document)).asked();deepStrictEqual(got.filter(c=>c.code==='head/forked'),[]);deepStrictEqual(got.filter(c=>c.code==='head/partial').map(c=>[c.fields.field,c.fields.value]).sort(),[['sky','clear'],['temperature','21']]);}
  finally {a.close();b.close();}
});

test('backed is a verb: each mark and why say who backed what, and no text a person reads uses it as a label or a definition', () => {
  ok(['agreed-unknown', 'agreed-undeclared', 'agreed-lineage', 'forked', 'partial', 'why'].every((code) => / backed (that|by) /.test(aboutOf(lock, `said/${code}`))));
  deepStrictEqual(lock.filter((l) => /\bbacked\b/i.test(l.about ?? '') && /\bbacked\b(?! (that|by|this|it|line))/i.test(l.about ?? '')).map((l) => l.scope), [], 'never a label');
});
