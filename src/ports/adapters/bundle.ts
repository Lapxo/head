import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, lstatSync, realpathSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { VERSIONED_MANIFEST_SCHEMAS } from '@anthropic-ai/mcpb';
import { createRequire } from 'node:module';
import { spawned } from '../process.ts';
import { compose, type Recipe, type Source } from '../../core/composition.ts';

export interface Member { readonly path: string; readonly bytes: number; readonly digest: string }
export interface Runtime { readonly protocol: 'head-runtime-closure@1'; readonly files: readonly Member[]; readonly bytes: number }
export interface BundlePort { readonly runtime: Uint8Array; readonly expected: string; readonly take: (path: string) => Uint8Array | undefined; readonly profile: Uint8Array }
export interface Payload { readonly recipe: Recipe; readonly sources: readonly Source[]; readonly files: ReadonlyMap<string, Uint8Array> }
const digest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const safe = (path: string) => /^[A-Za-z0-9_@.+/-]+$/.test(path) && path.split('/').every(part => part !== '' && part !== '.' && part !== '..');
/** Only the host's pinned public runtime closure is copied. A recipe never supplies executable paths, environment or grants. */
export async function bundle(port: BundlePort, payload: Payload | undefined, budget: { readonly bytes: number; readonly selections: number; readonly milliseconds: number; readonly printed: number }, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (Object.values(budget).some(n => !Number.isSafeInteger(n) || n < 1)) throw Error('bundle/budget');
  if (digest(port.runtime) !== port.expected) throw Error('bundle/runtime-digest');
  const runtime = JSON.parse(new TextDecoder().decode(port.runtime)) as Runtime;
  if (runtime.protocol !== 'head-runtime-closure@1' || !Array.isArray(runtime.files) || !runtime.files.length || !Number.isSafeInteger(runtime.bytes) || runtime.bytes < 1) throw Error('bundle/runtime');
  const files = new Map<string, Uint8Array>(); let size = 0;
  for (const member of runtime.files) {
    if (!safe(member.path) || !/^(dist\/src\/|node_modules\/|package\.json$|LICENSE$)/.test(member.path) || files.has(member.path)) throw Error('bundle/runtime-path');
    const bytes = port.take(member.path);
    if (!bytes || bytes.byteLength !== member.bytes || digest(bytes) !== member.digest) throw Error('bundle/runtime-member');
    files.set(member.path, bytes); size += bytes.byteLength;
  }
  if (size !== runtime.bytes || !files.has('dist/src/index.js') || !files.has('package.json') || !files.has('LICENSE')) throw Error('bundle/runtime-closure');
  files.set('runtime.bundle.json', port.runtime).set('TARGET.bound', port.profile).set('.mcpbignore', Buffer.from('!**\n*.mts\n*changelog*\n.env*\n.git/\n.bound/\nbirth.bound\n'));
  let manifest: Record<string, unknown> = { manifest_version: '0.3', name: 'head', version: JSON.parse(new TextDecoder().decode(files.get('package.json'))).version, description: 'Head without connected sources', author: { name: 'Package author' } };
  if (payload) {
    const made = compose(payload.recipe, payload.sources, budget.selections);
    let publicBytes = made.bytes.byteLength;
    for (const [path, bytes] of payload.files) {
      if (!safe(path) || /(^|\/)(\.bound|\.git|birth\.bound|node_modules)(\/|$)/.test(path)) throw Error('bundle/public-path');
      publicBytes += bytes.byteLength;
      if (publicBytes > budget.bytes) throw Error('bundle/public-budget');
      files.set(`composition/${path}`, bytes);
    }
    if (!payload.files.has('TARGET.bound')) throw Error('bundle/public-lock');
    files.set('composition/selection.json', made.bytes);
    manifest = { ...manifest, name: payload.recipe.id, version: payload.recipe.revision, display_name: payload.recipe.title, description: payload.recipe.description };
  }
  manifest = { ...manifest, server: { type: 'node', entry_point: 'dist/src/index.js', mcp_config: { command: 'node', args: ['${__dirname}/dist/src/index.js', 'run'] } }, compatibility: { platforms: ['darwin'], runtimes: { node: '>=22.18' } } };
  VERSIONED_MANIFEST_SCHEMAS['0.3'].parse(manifest);
  files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  const temporary = mkdtempSync(join(tmpdir(), 'head-export-'));
  try {
    const stage = join(temporary, 'package'), output = join(temporary, 'package.mcpb');
    for (const [path, bytes] of files) { signal?.throwIfAborted(); const at = join(stage, path); mkdirSync(dirname(at), { recursive: true }); writeFileSync(at, bytes); }
    const cli = join(dirname(createRequire(import.meta.url).resolve('@anthropic-ai/mcpb')), 'cli/cli.js');
    const result = await spawned(process.execPath, [cli, 'pack', stage, output], { cwd: temporary, env: { PATH: dirname(process.execPath), HOME: temporary, TMPDIR: temporary } }, { wait: budget.milliseconds, most: budget.printed, ...(signal ? { signal } : {}) });
    if (result.code !== 0) throw Error('bundle/pack');
    signal?.throwIfAborted(); const bytes = readFileSync(output);
    return { bytes, digest: digest(bytes), sources: payload?.recipe.sources.map(source => source.source) ?? [] };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

/** A host provisioned closure, pinned by Head's own profile. Never discover an arbitrary node_modules tree or fetch code here. */
export async function bundleAt(root: string, lock: readonly import('../../core/lock.ts').Said[], payload: Payload | undefined, signal?: AbortSignal) {
  const { valueOf } = await import('../../core/lock.ts');
  const expected = valueOf(lock, 'dep/runtime-bundle');
  if (!/^sha256:[a-f0-9]{64}$/.test(expected)) throw Error('bundle/runtime-unavailable');
  const packages = new Map<string, string>();
  const take = (path: string) => {
    try { return readFileSync(join(root, path)); } catch { /* Resolve only the package paths selected by the pinned inventory. */ }
    try { let rest = path, from = createRequire(join(root, 'package.json')), at = root;
      while (rest.startsWith('node_modules/')) {
        const parts = rest.slice(13).split('/'), count = parts[0]!.startsWith('@') ? 2 : 1, name = parts.slice(0, count).join('/');
        const key = at + '\0' + name, cached = packages.get(key);
        if (cached) at = cached; else {
          try { at = dirname(from.resolve(name + '/package.json')); } catch { at = dirname(from.resolve(name));
            while (true) { try { if (JSON.parse(readFileSync(join(at, 'package.json'), 'utf8')).name === name) break; } catch {}
              const parent = dirname(at); if (parent === at) throw Error('bundle/runtime-member'); at = parent;
            }
          } packages.set(key, at);
        }
        from = createRequire(join(at, 'package.json')); rest = parts.slice(count).join('/');
      }
      return path.startsWith('node_modules/') ? readFileSync(join(at, rest)) : undefined;
    } catch { return undefined; }
  };
  return bundle({ runtime: readFileSync(join(root, 'runtime.bundle.json')), expected, take, profile: readFileSync(join(root, 'TARGET.bound')) }, payload,
    { bytes: Number(valueOf(lock, 'share/bundle-bytes').split('..')[1]), selections: Number(valueOf(lock, 'share/bundle-selections').split('..')[1]), milliseconds: Number(valueOf(lock, 'bound/wait').split('..')[1]), printed: Number(valueOf(lock, 'bound/printed').split('..')[1]) }, signal);
}

/** A bounded snapshot of installed public members, never arbitrary files or symlink targets. */
export function publicAt(root: string, budget: number) {
  if (!Number.isSafeInteger(budget) || budget < 1) throw Error('bundle/budget');
  const base = realpathSync(root), held = new Map<string, Uint8Array>(); let consumed = 0;
  return { root: base, read: (path: string): Uint8Array | undefined => {
    if (!safe(path) || !(path === 'manifest.json' || path.startsWith('composition/'))) throw Error('bundle/public-path');
    if (held.has(path)) return held.get(path);
    try {
      let at = base; for (const part of path.split('/')) { at = join(at, part); if (lstatSync(at).isSymbolicLink()) throw Error('bundle/public-path'); }
      const fd = openSync(at, constants.O_RDONLY | constants.O_NOFOLLOW);
      try { const stat = fstatSync(fd); if (!stat.isFile() || stat.size > budget - consumed) throw Error('bundle/public-budget');
        const bytes = Buffer.alloc(stat.size); let offset = 0;
        while (offset < bytes.length) { const count = readSync(fd, bytes, offset, bytes.length - offset, null); if (!count) throw Error('bundle/public-member'); offset += count; }
        if (readSync(fd, Buffer.alloc(1), 0, 1, null)) throw Error('bundle/public-budget');
        consumed += bytes.length; held.set(path, bytes); return bytes;
      } finally { closeSync(fd); }
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  } };
}
