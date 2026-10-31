import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants, opendirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { nativeHostEnvironment } from '@lapxo/bound/host';

export interface NodeLocations { readonly platform?: string; readonly path?: readonly string[]; readonly home?: string; readonly brew?: readonly string[]; readonly programFiles?: string }
export class RuntimeNodeRequired extends Error {
  readonly reason: 'missing' | 'budget' | 'launch';
  readonly searched: readonly string[];
  constructor(reason: 'missing' | 'budget' | 'launch' = 'missing', searched = ['selected installed runtime']) { super('REFUSE·runtime/node-required Head could not establish an installed Node >=22.18.'); this.reason = reason; this.searched = searched; }
}
/** Installed runtime locations only: bounded directory enumeration, no shell or download. */
export function nodeDirectories(options: NodeLocations = {}, until = performance.now() + 2000): string[] {
  const platform = options.platform ?? process.platform, home = options.home ?? homedir();
  const children = (at: string, accepts: (name: string) => boolean = () => true): string[] => {
    const found: string[] = []; let directory: ReturnType<typeof opendirSync> | undefined;
    try { directory = opendirSync(at); for (let entry; performance.now() < until && (entry = directory.readSync());) if ((entry.isDirectory() || entry.isSymbolicLink()) && accepts(entry.name)) found.push(join(at, entry.name)); }
    catch { /* A missing manager directory grants no runtime. */ } finally { directory?.closeSync(); }
    return found.sort();
  };
  const directories = [...(options.path ?? (process.env['PATH'] ?? '').split(delimiter))];
  if (platform === 'darwin') {
    directories.push('/opt/homebrew/bin', '/usr/local/bin');
    for (const prefix of options.brew ?? ['/opt/homebrew', '/usr/local']) directories.push(...children(join(prefix, 'opt'), name => /^node(?:@\d+(?:\.\d+)*)?$/.test(name)).map(at => join(at, 'bin')));
  }
  if (isAbsolute(home)) directories.push(...children(join(home, '.nvm/versions/node')).map(at => join(at, 'bin')), join(home, '.volta/bin'), ...children(join(home, '.local/share/fnm/node-versions')).map(at => join(at, 'installation/bin')), join(home, '.asdf/shims'));
  const programFiles = options.programFiles ?? process.env['ProgramFiles'];
  if (platform === 'win32' && programFiles && isAbsolute(programFiles)) directories.push(join(programFiles, 'nodejs'));
  return [...new Set(directories.filter(isAbsolute))];
}
/** Select the greatest verified stable version; exhaustion never silently selects a lower unproven candidate. */
export function systemNode(directories?: readonly string[], options: NodeLocations = {}): string {
  const until = performance.now() + 2000, seen = new Set<string>(), selected = directories ?? nodeDirectories(options, until);
  const platform = options.platform ?? process.platform;
  const searched = directories ? ['explicit runtime locations'] : ['PATH', ...(platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin', '/opt/homebrew/opt/node*/bin', '/usr/local/opt/node*/bin'] : []), '~/.nvm/versions/node/*/bin', '~/.volta/bin', '~/.local/share/fnm/node-versions/*/installation/bin', '~/.asdf/shims', ...(platform === 'win32' ? ['%ProgramFiles%/nodejs'] : [])];
  const checkBudget = () => { if (performance.now() >= until) throw new RuntimeNodeRequired('budget', searched); };
  let best: { path: string; version: number[] } | undefined;
  for (const directory of selected) {
    checkBudget();
    if (!isAbsolute(directory)) continue;
    try {
      const path = realpathSync(join(directory, (options.platform ?? process.platform) === 'win32' ? 'node.exe' : 'node'));
      if (seen.has(path)) continue;
      seen.add(path); accessSync(path, constants.X_OK);
      const got = spawnSync(path, ['-p', 'JSON.stringify(process.versions)'], { env: nativeHostEnvironment({ ...process.env }), encoding: 'utf8', timeout: Math.max(1, Math.min(250, Math.floor(until - performance.now()))), maxBuffer: 4096, windowsHide: true });
      if (got.status !== 0 || got.stderr) continue;
      const versions = JSON.parse(got.stdout), match = /^(\d+)\.(\d+)\.(\d+)$/.exec(versions.node ?? '');
      if (versions.electron || !match) continue;
      const version = match.slice(1).map(Number);
      if (!version.every(Number.isSafeInteger)) continue;
      if (version[0]! < 22 || version[0] === 22 && version[1]! < 18) continue;
      const difference = best ? version.map((n, i) => n - best!.version[i]!).find(n => n !== 0) ?? 0 : 1;
      if (difference > 0) best = { path, version };
    } catch { /* Candidate exceptions and output never become diagnostic content. */ }
  }
  checkBudget();
  if (best) return best.path;
  throw new RuntimeNodeRequired('missing', searched);
}

/** Relaunch the whole server once, so its signer, Bound host and packager share the selected Node. */
export async function relayToNode(entry: string, args: readonly string[], directories?: string[]): Promise<number> {
  const child = spawn(systemNode(directories), [entry, ...args], { stdio: ['pipe', 'pipe', 'pipe'], env: nativeHostEnvironment({ ...process.env }) });
  const closeInput = () => { if (!child.stdin.destroyed) child.stdin.end(); };
  const inputError = (error: NodeJS.ErrnoException) => { if (error.code !== 'EPIPE') child.kill('SIGTERM'); };
  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout, { end: false });
  child.stderr.pipe(process.stderr, { end: false });
  process.stdin.once('close', closeInput); process.stdin.once('error', closeInput);
  child.stdin.on('error', inputError);
  const stop = (signal: NodeJS.Signals) => child.kill(signal);
  const interrupt = () => { stop('SIGINT'); }, terminate = () => { stop('SIGTERM'); };
  process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
  try { return await new Promise<number>((resolve, reject) => { child.once('error', () => reject(new RuntimeNodeRequired('launch'))); child.once('close', code => process.stdout.write('', () => process.stderr.write('', () => resolve(code ?? 1)))); }); }
  finally {
    process.stdin.unpipe(child.stdin); process.stdin.pause();
    process.stdin.removeListener('close', closeInput); process.stdin.removeListener('error', closeInput);
    child.stdin.removeListener('error', inputError);
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate);
  }
}
