import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

export interface Member { readonly path: string; readonly bytes: number; readonly digest: string }
export interface Runtime { readonly protocol: 'head-runtime-closure@1' | 'head-runtime-closure@2'; readonly files: readonly Member[]; readonly bytes: number; readonly auxiliary?: readonly Member[]; readonly execution?: { readonly platform: 'darwin'; readonly architectures: readonly string[]; readonly path: 'runtime/node'; readonly license: 'runtime/LICENSE'; readonly mode: 493; readonly version: string } }
export interface BundlePort { readonly runtime: Uint8Array; readonly expected: string; readonly take: (path: string) => Uint8Array | undefined; readonly profile: Uint8Array }
export const digest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export const safe = (path: string) => /^[A-Za-z0-9_@.+/-]+$/.test(path) && path.split('/').every(part => part !== '' && part !== '.' && part !== '..');

/** Current bytes of a pinned closure, verified once for both packing and installed delivery checks. */
export function verifiedRuntime(port: BundlePort) {
  if (digest(port.runtime) !== port.expected) throw Error('bundle/runtime-digest');
  const runtime = JSON.parse(new TextDecoder().decode(port.runtime)) as Runtime;
  if (!['head-runtime-closure@1', 'head-runtime-closure@2'].includes(runtime.protocol) || !Array.isArray(runtime.files) || !runtime.files.length || !Number.isSafeInteger(runtime.bytes) || runtime.bytes < 1) throw Error('bundle/runtime');
  const execution = runtime.execution;
  if (runtime.protocol === 'head-runtime-closure@2' ? !execution || execution.platform !== 'darwin' || JSON.stringify(execution.architectures) !== '["arm64","x64"]' || execution.path !== 'runtime/node' || execution.license !== 'runtime/LICENSE' || execution.mode !== 0o755 || !/^v\d+\.\d+\.\d+$/.test(execution.version) : execution !== undefined) throw Error('bundle/runtime-execution');
  if (execution && Object.keys(execution).sort().join('|') !== 'architectures|license|mode|path|platform|version') throw Error('bundle/runtime-execution');
  const files = new Map<string, Uint8Array>(); let size = 0;
  for (const member of runtime.files) {
    if (!safe(member.path) || !(/^(dist\/src\/|node_modules\/|package\.json$|LICENSE$)/.test(member.path) || execution && [execution.path, execution.license].includes(member.path)) || files.has(member.path)) throw Error('bundle/runtime-path');
    const bytes = port.take(member.path);
    if (!bytes || bytes.byteLength !== member.bytes || digest(bytes) !== member.digest) throw Error('bundle/runtime-member');
    files.set(member.path, bytes); size += bytes.byteLength;
  }
  if (size !== runtime.bytes || !files.has('dist/src/index.js') || !files.has('package.json') || !files.has('LICENSE')) throw Error('bundle/runtime-closure');
  if (execution && (!files.has(execution.path) || !files.has(execution.license))) throw Error('bundle/runtime-closure');
  const auxiliary = new Map<string, Uint8Array>(), declared = new Set<string>();
  if (runtime.auxiliary !== undefined && (runtime.protocol !== 'head-runtime-closure@2' || !Array.isArray(runtime.auxiliary))) throw Error('bundle/runtime-auxiliary');
  for (const member of runtime.auxiliary ?? []) {
    if (!safe(member.path) || !member.path.startsWith('node_modules/') || !/(\.(?:ts|mts|cts|map|tsbuildinfo|md)$|\/(?:tsconfig\.json|\.eslintrc|\.nycrc|\.editorconfig)$)/i.test(member.path) || !Number.isSafeInteger(member.bytes) || member.bytes < 0 || !/^sha256:[a-f0-9]{64}$/.test(member.digest) || files.has(member.path) || declared.has(member.path)) throw Error('bundle/runtime-auxiliary');
    declared.add(member.path);
    const bytes = port.take(member.path); if (!bytes) continue;
    if (bytes.byteLength !== member.bytes || digest(bytes) !== member.digest) throw Error('bundle/runtime-member');
    auxiliary.set(member.path, bytes);
  }
  return { files, auxiliary, execution, runtime };
}

/** Resolve exactly the installed members named by the pinned inventory, including npm-hoisted dependencies. */
export function runtimePortAt(root: string, expected: string): BundlePort {
  const packages = new Map<string, string>();
  const take = (path: string) => {
    try { return readFileSync(join(root, path)); } catch { /* Resolve only the package paths selected by the pinned inventory. */ }
    try { let rest = path, from = createRequire(join(root, 'package.json')), at = root;
      while (rest.startsWith('node_modules/')) {
        const parts = rest.slice(13).split('/'), count = parts[0]!.startsWith('@') ? 2 : 1, name = parts.slice(0, count).join('/');
        const key = at + '\0' + name, cached = packages.get(key);
        if (cached) at = cached; else {
          const found = from.resolve.paths(name)?.map(base => join(base, name)).find(base => { try { return typeof JSON.parse(readFileSync(join(base, 'package.json'), 'utf8')).name === 'string'; } catch { return false; } });
          if (!found) throw Error('bundle/runtime-member'); at = found; packages.set(key, at);
        }
        from = createRequire(join(at, 'package.json')); rest = parts.slice(count).join('/');
      }
      return path.startsWith('node_modules/') ? readFileSync(join(at, rest)) : undefined;
    } catch { return undefined; }
  };
  return { runtime: readFileSync(join(root, 'runtime.bundle.json')), expected, take, profile: readFileSync(join(root, 'TARGET.bound')) };
}
