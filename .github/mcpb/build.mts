// The Desktop Extension (.mcpb) of the package as npm ships it: the same files, its production dependencies at the lock's exact versions, and a manifest rendered from head's lock (name, version, tools); validated and zipped as mcpb does, its entries in order, at one fixed time and mode, so the same commit gives the same digest.
// usage: node .github/mcpb/build.mts <out dir>   (after npm run build)
import { execFileSync } from 'node:child_process';
import { getAllFilesWithCount, readMcpbIgnorePatterns, validateManifest } from '@anthropic-ai/mcpb/node';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { declaredOf } from '../../src/core/lock.ts';

const [out] = process.argv.slice(2) as [string];
const root = resolve(import.meta.dirname, '../..'), pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')), lock = declaredOf(readFileSync(join(root, 'TARGET.bound'), 'utf8'));
const stage = mkdtempSync(join(tmpdir(), 'head-mcpb-'));
for (const at of [...pkg.files, 'package.json', 'package-lock.json', 'README.md'].filter((f) => existsSync(join(root, f)))) cpSync(join(root, at), join(stage, at), { recursive: true });
execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: stage, stdio: 'inherit' });
const tools = lock.filter((l) => /^tool\/[a-z]+$/.test(l.scope ?? '')).map((l) => ({ name: l.scope!.slice('tool/'.length), description: l.about ?? '' })).sort((a, b) => a.name.localeCompare(b.name));
const manifest = {
  manifest_version: '0.3', name: 'head', display_name: 'head', version: pkg.version, description: pkg.description, author: { name: pkg.author }, license: pkg.license,
  repository: { type: 'git', url: 'https://github.com/Lapxo/head' }, homepage: 'https://github.com/Lapxo/head',
  server: { type: 'node', entry_point: 'dist/src/index.js', mcp_config: { command: 'node', args: ['${__dirname}/dist/src/index.js'], env: {} } },
  tools, tools_generated: false, keywords: ['bound', 'openapi', 'mcp'],
  compatibility: { platforms: ['darwin', 'win32'], runtimes: { node: pkg.engines.node } },
};
writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
if (!validateManifest(join(stage, 'manifest.json'))) process.exit(1);
const { files } = getAllFilesWithCount(stage, stage, {}, readMcpbIgnorePatterns(stage)), mtime = new Date(1980, 0, 2);
const zipped = zipSync(Object.fromEntries(Object.keys(files).sort().map((at) => [at, [files[at]!.data, { os: 3, attrs: ((files[at]!.mode & 0o111) ? 0o755 : 0o644) << 16, mtime }]])), { level: 9, mtime });
mkdirSync(out, { recursive: true });
const packed = join(out, 'head.mcpb');
writeFileSync(packed, zipped);
const digest = `sha256:${createHash('sha256').update(readFileSync(packed)).digest('hex')}`, named = join(out, `head-${pkg.version}-${digest.slice(7, 23)}.mcpb`);
renameSync(packed, named);
writeFileSync(join(out, 'release.json'), `${JSON.stringify({ bundle: named.split('/').at(-1), digest, version: pkg.version, tools: tools.map((t) => t.name) })}\n`);
console.log(`MCPB     ${named} · ${digest} · ${tools.length} tools`);
