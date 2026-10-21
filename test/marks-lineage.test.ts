import { test } from 'node:test';
import { ok } from 'node:assert';
import { valueOf } from '../src/core/lock.ts';
import { line, lock } from './place.ts';
import { api, other, own, person } from './two-sources.ts';

const shares = (source: string, value: string) => line(`${valueOf(lock, 'marks/shares')}/${source}`, 'id', value, { at: 'policy:person/lineage' });

test('lineage, as the place declares it and no further: a source declared to share the other-s lineage is ○ and may add nothing; declared to share none, nobody has declared that they share lineage — never that they are independent', async () => {
  const [a, b] = [await api(() => '{"temperature":21,"sky":"clear"}'), await api(() => '{"temperature":21,"sky":"clear"}')];
  try {
    const p = await person(a.document, b.document);
    p.rooted([shares('mirror', 'forecast')]);
    const kin = await p.asked();
    ok(kin.every((c) => c.code === 'head/agreed-lineage' && c.fields.marks === own + other && c.fields.source === 'mirror' && c.fields.other === 'forecast'), JSON.stringify(kin.map((c) => [c.code, c.fields.marks])));
    const q = await person(a.document, b.document);
    q.rooted([shares('forecast', valueOf(lock, 'marks/undeclared')), shares('mirror', valueOf(lock, 'marks/undeclared'))]);
    const none = await q.asked();
    ok(none.every((c) => c.code === 'head/agreed-undeclared' && c.fields.marks === own + own), JSON.stringify(none.map((c) => c.code)));
    ok(!lock.some((l) => /don-t copy each other|do not copy each other/.test(l.about ?? '')), 'head never says that two sources do not copy each other');
  } finally { a.close(); b.close(); }
});

test('the same source in another form: two sources reached at the same origin are one, ○, though nobody declared it', async () => {
  const a = await api(() => '{"temperature":21,"sky":"clear"}');
  try {
    const got = await (await person(a.document, a.document)).asked();
    ok(got.length > 0 && got.every((c) => c.code === 'head/agreed-lineage' && c.fields.marks === own + other), JSON.stringify(got.map((c) => [c.code, c.fields.marks])));
  } finally { a.close(); }
});

test('the same source asked twice is one source: its second mark is ○, never a second ●, and it is read once', async () => {
  let reads = 0;
  const a = await api(() => { reads += 1; return '{"temperature":21,"sky":"clear"}'; }), b = await api(() => '{"temperature":21,"sky":"clear"}');
  try {
    const p = await person(a.document, b.document), before = reads, got = await p.asked('forecast|forecast');
    ok(got.length > 0 && got.every((c) => c.code === 'head/agreed-lineage' && c.fields.marks === own + other && c.fields.source === 'forecast' && c.fields.other === 'forecast'), JSON.stringify(got.map((c) => [c.code, c.fields.marks])));
    ok(reads - before <= 1, `the source was called ${reads - before} times for one question asked twice of it`);
  } finally { a.close(); b.close(); }
});
