# A typed answer from a local API

This checkout example needs macOS and Node 22.18 or later. From the repository root, install its pinned dependencies with `npm ci --ignore-scripts`.

The existing test client speaks MCP, follows cards and handles the catalogue actions through the three public tools. This demo creates a temporary home, simulated keychain and loopback API. Its automatic yes applies only to this fixture. In normal use, you approve the connection yourself. The first run may fetch pinned public world artifacts; the API itself is local.

Run this from the repository root:

```sh
node --input-type=module <<'JS'
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { strict as assert } from 'node:assert';
import { api } from './test/two-sources.ts';
import { ask } from './test/client.ts';
import { fakeKeychain } from './test/fake-keychain.ts';
import { parse } from '@lapxo/topos/wire';
const demo = JSON.parse(readFileSync('docs/examples/first-minute.json', 'utf8'));
const fixture = await api(() => JSON.stringify(demo.response));
const home = mkdtempSync(join(tmpdir(), 'head-example-'));
const env = { ...fakeKeychain({}).env, HEAD_HOME: join(home, 'home'), HOME: home, USERPROFILE: home };
const call = (name, arguments_) => ({ method: 'tools/call', params: { name, arguments: arguments_ } });
try {
  const results = await ask([
    call('connect', { source: demo.source, document: fixture.document }),
    call('ask', { place: join(home, 'place'), source: demo.source, operation: demo.operation, args: demo.args })
  ], [], env, () => ({ action: 'accept', content: { yes: true } }));
  const output = results.at(-1).result.content[0].text;
  const lines = output.split('\n').map(parse).filter(p => p.kind === 'fact').map(p => p.value.fields);
  for (const [field, value] of Object.entries(demo.expectedTypedValues))
    assert(lines.some(line => line.scope?.endsWith('/' + field) && line.value === value));
  assert(lines.some(line => line.scope?.startsWith('read/forecast/') && line.measure === 'digest' && line.sig));
  console.log(JSON.stringify({ source: demo.source, values: Object.fromEntries(Object.keys(demo.expectedTypedValues).map(field => [field, lines.find(line => line.scope?.endsWith('/' + field)).value])), receipt: lines.find(line => line.scope?.startsWith('read/forecast/') && line.measure === 'digest').value }, null, 2));
} finally { fixture.close(); }
JS
```

The returned fields include `temperature = 21` and `sky = clear`, plus the read's signed digest receipt. Paths and signatures vary; those are observations, not fixed demo bytes. The fixture schema supplies the types. Another API with no usable schema is named untyped instead of receiving invented types.

To ask a real source, supply its document in your assistant, choose a source name, and approve its connection. An overlay can fill in what the provider declares separately. Access is anonymous only when permitted, or obtained by the declared flow or secret-input path. Never enter a secret in the model conversation. See [access options](connect-any-api.md).

The separate timing acceptance is `HEAD_ONBOARDING=1 HEAD_FIRST_CELL_STRICT=1 node --test test/onboarding.test.ts`. Running this demo is not a timing or platform certification.
