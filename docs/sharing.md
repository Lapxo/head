# Share public declarations, then inspect them

A place has several different things you can share:

- A source package names its documents, overlays and compiled pins by digest. Receiving it still needs local permission.
- A content reference names bytes. A separate holder location says where to obtain them; no location means no invented address. A viewer address is not a holder.
- `birth.topos` is a separate unsigned public declaration artifact. It does not carry the local `birth.bound`, keys, grants or admission history.

This executable checkout example shares only a public language declaration. It creates independent fixture places and simulated keys. It does not contact an external API or change your real keychain. Run `npm ci --ignore-scripts` first; Node 22.18 or later is required.

```sh
node --input-type=module <<'JS'
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { strict as assert } from 'node:assert';
import { born, line } from './test/place.ts';
import { ask } from './test/client.ts';
const demo = JSON.parse(readFileSync('docs/examples/sharing.json', 'utf8'));
const shared = mkdtempSync(join(tmpdir(), 'head-public-example-'));
const sender = born(undefined, [line(demo.sender.scope, 'id', demo.sender.value)], null, false, 'catalog', false);
const receiver = born(undefined, [line(demo.receiver.scope, 'id', demo.receiver.value)], null, false, 'route-notes', false);
const env = p => ({ ...p.keychain.env, HEAD_HOME: join(mkdtempSync(join(tmpdir(), 'head-example-home-')), 'home') });
const call = (name, arguments_) => ({ method: 'tools/call', params: { name, arguments: arguments_ } });
const [packed] = await ask([call('share', { place: sender.place, to: join(shared, 'public') })], [shared], env(sender));
const birth = packed.result.structuredContent.cells.find(c => c.code === 'head/birth-shared');
assert(birth);
const before = readFileSync(join(receiver.place, 'TARGET.bound'));
const [inspected, altered] = await ask([
  call('connect', { place: receiver.place, document: birth.fields.document, digest: birth.fields.digest }),
  call('connect', { place: receiver.place, document: birth.fields.record + ' ', digest: birth.fields.digest })
], [shared], env(receiver));
const observation = inspected.result.structuredContent.cells.find(c => c.code === demo.expectedCode);
assert(observation && observation.fields.collisions === demo.expectedCollision);
assert(altered.result.structuredContent.cells.some(c => c.code === demo.negativeCode));
assert.deepEqual(readFileSync(join(receiver.place, 'TARGET.bound')), before);
console.log(JSON.stringify({ inspection: observation.code, collision: observation.fields.collisions, alteredBytes: demo.negativeCode, authorityTransferred: false }, null, 2));
JS
```

The receiver names the occupied `lang` coordinate and keeps its own value. One changed byte with the expected digest is refused. Inspection does not import permission or identify an authenticated sender. To adopt a declaration, the receiver uses its ordinary local admission process; this example intentionally does not do that.

A standing reference follows the same separation: compare the expected content identity and apply the receiver's network policy before fetching. A holder URL is not authority. The existing located-reference vector is `node --test test/link-url.test.ts`; it also covers missing locations, altered bytes and denied transport. Review source documents for sensitive information before sharing them.
