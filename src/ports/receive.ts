import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, constants, openSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalPath } from './place.ts';

/** A macOS advisory lock spans the whole receive. Kept inode, no signer, and EOF releases it even if Head dies. */
export async function receivingAt<T>(place: string, work: () => Promise<T>, wait: number, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  if (process.platform !== 'darwin') throw Error('receive/platform');
  const name = createHash('sha256').update(canonicalPath(place)).digest('hex');
  const fd = openSync(join('/tmp', `.head-receive-${name}.lock`), constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  const child = spawn('/usr/bin/lockf', ['-s', '-t', '0', '/dev/fd/3', process.execPath, '-e', "process.stdout.write('ready'); process.stdin.resume(); process.stdin.on('end',()=>process.exit(0));"], { stdio: ['pipe', 'pipe', 'ignore', fd], shell: false });
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  const stop = () => child.stdin?.end();
  signal?.addEventListener('abort', stop, { once: true });
  const startup = AbortSignal.timeout(wait);
  startup.addEventListener('abort', stop, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => reject(Error(code === 75 ? 'receive/busy' : 'receive/lock')));
      child.stdout!.once('data', bytes => bytes.toString() === 'ready' ? resolve() : reject(Error('receive/lock')));
    });
    startup.removeEventListener('abort', stop); startup.throwIfAborted(); signal?.throwIfAborted();
    return await work();
  } finally {
    startup.removeEventListener('abort', stop); signal?.removeEventListener('abort', stop); stop();
    await closed; closeSync(fd);
  }
}
