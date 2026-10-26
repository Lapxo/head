# Agreement keeps its sources

Two matching answers need not be two independent observations. head compares typed fields, keeps each source and its read receipt, and displays declared lineage rather than inventing a confidence score.

| Marks | What the view says |
|---|---|
| `●○` | A later source shares declared lineage or a recognized source identity with an earlier one. |
| `●●` | Separate source marks in this view. Unknown or undeclared lineage is not proof of independence. |

If values differ, head shows each source's value and time. It does not pick a winner or manufacture a numeric loss. A field missing from one source is partial evidence, not disagreement with an assertion nobody made.

This checkout example uses the existing two-source fixture and declaration/withdrawal mechanism. The fixture sources return the same two fields; these are not measurements or an independence experiment. Run `npm ci --ignore-scripts` first, then:

```sh
node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { api, person } from './test/two-sources.ts';
const demo = JSON.parse(readFileSync('docs/examples/lineage.json', 'utf8'));
const a = await api(() => JSON.stringify(demo.response));
const b = await api(() => JSON.stringify(demo.response));
try {
  const p = await person(a.document, b.document);
  p.rooted([demo.declare]);
  const grouped = await p.asked();
  assert(grouped.length > 0 && grouped.every(c => c.code === demo.before.code && c.fields.marks === demo.before.marks));
  const receipts = new Set(grouped.flatMap(c => c.fields.receipts.split('|')));
  assert(grouped.every(c => c.fields.sources === 'forecast, mirror' && c.fields.receipts.split('|').length === 2));
  assert([...receipts].every(receipt => p.receipts().has(receipt)));
  p.rooted([demo.withdraw]);
  const after = await p.asked();
  assert(after.length > 0 && after.every(c => c.code === demo.after.code && c.fields.marks === demo.after.marks));
  assert(after.every(c => c.fields.sources === 'forecast, mirror'));
  assert([...receipts].every(receipt => p.receipts().has(receipt)));
  console.log(JSON.stringify({ before: demo.before, after: demo.after, oldReceiptsRetained: true, independenceProved: false }, null, 2));
} finally { a.close(); b.close(); }
JS
```

The declaration says that `mirror` shares `forecast`'s lineage. Its withdrawal removes that current claim, not the sources or old receipts. The later `●●` is reported as **unknown lineage**, not newfound independence. Each mark still points to a source-specific read; grouping does not merge receipt identities.
