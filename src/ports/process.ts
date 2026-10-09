import { spawn } from 'node:child_process';

export interface Printed { readonly code: number; readonly out: readonly string[]; readonly err: readonly string[] }
export interface Bounds { readonly wait: number; readonly most: number; readonly signal?: AbortSignal }

const running = new Set<() => void>();
process.once('exit', () => { for (const stop of running) stop(); });

/**
 * A process run beside head, never blocking it: what it printed, out and err, line by line, and its exit, which is
 * transport and never the verdict. Its whole group is stopped when the wait runs out, when it prints more bytes than it
 * may, when the asker cancels or when head exits; the exit is then -1 and the cause is err's last line.
 */
export const spawned = (command: string, args: readonly string[], at: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly input?: string }, bounds: Bounds): Promise<Printed> => new Promise((resolve) => {
  const child = spawn(command, [...args], { cwd: at.cwd, env: at.env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
  const [out, err] = [[] as Buffer[], [] as Buffer[]];
  let [printed, cause, done] = [0, undefined as string | undefined, false];
  const kill = () => { try { if (child.pid !== undefined && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { child.kill('SIGKILL'); } };
  const stop = (why: string) => { cause ??= why; kill(); };
  const signal = AbortSignal.any([...(bounds.wait > 0 ? [AbortSignal.timeout(bounds.wait)] : []), ...(bounds.signal ? [bounds.signal] : [])]);
  const cancel = () => stop(bounds.signal?.aborted ? 'cancelled' : `waited ${bounds.wait} ms`);
  const finish = (code: number) => {
    if (done) return;
    done = true; signal.removeEventListener('abort', cancel); running.delete(kill);
    const lines = (chunks: Buffer[]) => Buffer.concat(chunks).toString('utf8').split('\n').filter(Boolean);
    resolve({ code: cause === undefined ? code : -1, out: lines(out), err: [...lines(err), ...(cause === undefined ? [] : [cause])] });
  };
  const take = (into: Buffer[]) => (chunk: Buffer) => { printed += chunk.length; if (printed > bounds.most) stop(`printed more than ${bounds.most} bytes`); else into.push(chunk); };
  running.add(kill);
  child.stdout.on('data', take(out)); child.stderr.on('data', take(err));
  child.on('error', (error) => { cause ??= error.message; finish(-1); });
  child.on('close', (code) => finish(code ?? -1));
  child.stdin.on('error', () => undefined).end(at.input ?? '');
  if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
});
