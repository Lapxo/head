import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants, realpathSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { nativeHostEnvironment } from '@lapxo/bound/host';

/** Discover only an executable installed locally; never download code or interpret shell commands. */
export function systemNode(directories = [...(process.env['PATH'] ?? '').split(delimiter), ...(process.platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin'] : [])]): string {
  const until = performance.now() + 2000, seen = new Set<string>();
  for (const directory of directories) {
    if (!isAbsolute(directory) || performance.now() >= until) continue;
    try {
      const path = realpathSync(join(directory, process.platform === 'win32' ? 'node.exe' : 'node'));
      if (seen.has(path)) continue;
      seen.add(path); accessSync(path, constants.X_OK);
      const got = spawnSync(path, ['-p', 'JSON.stringify(process.versions)'], { env: nativeHostEnvironment({ ...process.env }), encoding: 'utf8', timeout: Math.max(1, Math.floor(until - performance.now())), maxBuffer: 4096, windowsHide: true });
      if (got.status !== 0 || got.stderr) continue;
      const versions = JSON.parse(got.stdout), version = /^(\d+)\.(\d+)\.(\d+)$/.exec(versions.node ?? '');
      if (!versions.electron && version && (+version[1]! > 22 || +version[1]! === 22 && +version[2]! >= 18)) return path;
    } catch { /* An unavailable or incompatible candidate grants no fallback to the Electron executable. */ }
  }
  throw Error('REFUSE·runtime/node-required Head needs an installed Node >=22.18; this package includes no Node executable.');
}

/** Relaunch the whole server once, so its signer, Bound host and packager share the selected Node. */
export async function relayToNode(entry: string, args: readonly string[], directories?: string[]): Promise<number> {
  const child = spawn(systemNode(directories), [entry, ...args], { stdio: 'inherit', env: nativeHostEnvironment({ ...process.env }) });
  const stop = (signal: NodeJS.Signals) => child.kill(signal);
  const interrupt = () => { stop('SIGINT'); }, terminate = () => { stop('SIGTERM'); };
  process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
  try { return await new Promise<number>((resolve, reject) => { child.once('error', () => reject(Error('REFUSE·runtime/node-required Head could not start its installed Node.'))); child.once('close', code => resolve(code ?? 1)); }); }
  finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate); }
}
