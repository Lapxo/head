import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { surfaceOf } from '../src/core/surface.ts';
import { run } from './cli.ts';
import { lockAt } from '../src/ports/place.ts';
import { ask } from './client.ts';
import { publicOf } from '../src/core/keys.ts';
import { fakeKeychain } from './fake-keychain.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const surface = surfaceOf(lockAt(root));

test('a client is offered exactly the lock-s tools, with their words and hints, and its resource templates', async () => {
  const [tools, templates] = await ask([{ method: 'tools/list' }, { method: 'resources/templates/list' }]);
  deepStrictEqual(tools.result.tools.map((t: any) => [t.name, t.description, Object.keys(t.inputSchema.properties), Object.keys(t.annotations)]),
    surface.tools.map((t) => [t.name, t.about, t.fields.map((f) => f.name), t.hints.map((h) => `${h}Hint`)]));
  deepStrictEqual(templates.result.resourceTemplates.map((r: any) => [r.name, r.uriTemplate]), surface.resources.map((r) => [r.name, r.template]));
});

test('look over a root the client shares answers exactly what bound printed there', async () => {
  const place = mkdtempSync(join(tmpdir(), 'head-place-'));
  const [looked] = await ask([{ method: 'tools/call', params: { name: 'look', arguments: {} } }], [place]);
  const printed = run('@lapxo/bound', place, ['fold', '--as', 'lines'])!;
  deepStrictEqual(looked.result.content[0].text, [...printed.out, ...printed.err].join('\n'));
});

test('a view read as a resource is exactly what bound printed for it', async () => {
  const place = mkdtempSync(join(tmpdir(), 'head-place-'));
  const [read] = await ask([{ method: 'resources/read', params: { uri: `bound://view/help?place=${encodeURIComponent(place)}` } }]);
  const printed = run('@lapxo/bound', place, ['fold', '--as', 'help'])!;
  deepStrictEqual(read.result.contents[0].text, [...printed.out, ...printed.err].join('\n'));
});

test('key makes the device key once in the keychain and answers only the lines that admit it: no secret crosses an argument or an answer', async () => {
  const keychain = fakeKeychain({ head: undefined });
  const [first, second] = await ask([{ method: 'tools/call', params: { name: 'key', arguments: {} } }, { method: 'tools/call', params: { name: 'key', arguments: {} } }], [], keychain.env);
  const secret = keychain.held('head');
  const lines = first.result.content[0].text.split('\n');
  deepStrictEqual([second.result.content[0].text === first.result.content[0].text, lines.length, lines.some((l: string) => l.includes(` scope=keys/head `) && l.includes(publicOf(secret)))], [true, 5, true]);
  deepStrictEqual([first.result.content[0].text.includes(secret), keychain.argv().includes(secret), secret.length > 0], [false, false, true]);
});
