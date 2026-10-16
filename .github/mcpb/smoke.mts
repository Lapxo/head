// The bundle as a host runs it: unpacked into a folder of its own, its manifest's command started over stdio in a fresh home, asked for its tools, then founding a place, connecting a document and reading one offer — nothing of the repository on the way.
// usage: node .github/mcpb/smoke.mts <bundle.mcpb> <release.json>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from '../../test/client.ts';
import { fakeKeychain } from '../../test/fake-keychain.ts';

const [bundle, release] = process.argv.slice(2) as [string, string];
const named = JSON.parse(readFileSync(release, 'utf8')) as { digest: string; tools: string[] }, digest = `sha256:${createHash('sha256').update(readFileSync(bundle)).digest('hex')}`;
if (digest !== named.digest) { console.error(`REFUSE·bundle ${bundle} hashes to ${digest}, not the ${named.digest} its release names`); process.exit(1); }
const unpacked = mkdtempSync(join(tmpdir(), 'head-unpacked-'));
execFileSync('unzip', ['-q', bundle, '-d', unpacked]);
const manifest = JSON.parse(readFileSync(join(unpacked, 'manifest.json'), 'utf8')), entry = manifest.server.mcp_config.args[0].replace('${__dirname}', unpacked);
process.env['HEAD_ENTRY'] = entry;
const server = createServer((_, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"id":1}'); });
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, [home, shared] = [mkdtempSync(join(tmpdir(), 'head-home-')), mkdtempSync(join(tmpdir(), 'head-smoke-'))];
const env = { ...fakeKeychain({}).env, HEAD_HOME: home }, place = join(shared, 'mine'), yes = () => ({ action: 'accept', content: { yes: true } });
writeFileSync(join(shared, 'weather.json'), JSON.stringify({ openapi: '3.0.3', info: { title: 'weather', version: '1' }, servers: [{ url: origin }], paths: { '/forecast': { get: { operationId: 'getForecast', security: [], responses: { 200: { description: 'ok' } } } } } }));
const tool = (name: string, args: Record<string, string>) => ({ method: 'tools/call', params: { name, arguments: args } });
const [listed] = await ask([{ method: 'tools/list' }], [], env);
const tools = (listed?.result?.tools ?? []).map((t: { name: string }) => t.name).sort();
await ask([tool('place', { dir: place })], [], env, yes);
await ask([tool('connect', { place, source: 'weather', document: join(shared, 'weather.json') })], [shared], env, yes);
const [read] = await ask([tool('look', { place, source: 'weather', operation: 'getForecast', at: '8' })], [], env, yes);
server.close();
const answered = (read?.result?.structuredContent?.cells ?? []).some((c: { code: string; fields: Record<string, string> }) => c.code === 'head/answered' && c.fields['status'] === '200' && c.fields['operation'] === 'getForecast');
console.log(`SMOKE    ${digest} · tools ${tools.length} (${tools.join(' ')}) · read ${answered ? 'answered 200' : 'did not answer'}`);
if (tools.join(' ') !== [...named.tools].sort().join(' ') || !answered) { console.error(JSON.stringify(read?.result ?? read).slice(0, 1200)); process.exit(1); }
