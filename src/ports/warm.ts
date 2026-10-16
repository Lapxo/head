import type { ChildProcess } from 'node:child_process';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { grouped, watched } from './process.ts';
import type { Bounds, Printed } from './process.ts';

/** How many processes head keeps started ahead of each program while it answers a call, and the variables node reads as it starts: a process started under other values of them is never asked. */
export const warmth = { spares: 0, boot: [] as readonly string[] };

interface Spare { readonly child: ChildProcess; readonly boot: string; readonly ready: Promise<void>; loaded: boolean }
const spares = new Map<string, Spare[]>();
const alive = (one: Spare) => one.child.exitCode === null && one.child.signalCode === null;
const entry = fileURLToPath(new URL(`./spare${import.meta.url.slice(import.meta.url.lastIndexOf('.'))}`, import.meta.url));
const bootOf = (env: NodeJS.ProcessEnv) => JSON.stringify(Object.entries(env).filter(([name]) => warmth.boot.some((p) => name.startsWith(p))).sort(([a], [b]) => (a < b ? -1 : 1)));
const stop = (one: Spare) => { try { process.kill(-one.child.pid!, 'SIGKILL'); } catch { one.child.kill('SIGKILL'); } };

const started = (program: string): Spare => {
  const env = { ...process.env }, child = grouped(process.execPath, [entry, program], { env }, 4);
  child.stdin!.on('error', () => undefined).end('');
  const spare: Spare = { child, boot: bootOf(env), ready: new Promise<void>((resolve) => { (child.stdio[3] as Duplex).on('error', () => undefined).once('data', () => { spare.loaded = true; resolve(); }); child.once('close', () => resolve()); }), loaded: false };
  return spare;
};

/** Keeps as many processes started ahead of a program as head's lock says; resolved when each has loaded what it runs. */
export const kept = (program: string): Promise<unknown> => {
  const live = (spares.get(program) ?? []).filter(alive);
  while (live.length < warmth.spares) live.push(started(program));
  spares.set(program, live);
  return Promise.all(live.map((one) => one.ready));
};

/** Every process still waiting to be asked is stopped: head keeps none past the call it started them for. */
export const cooled = (): void => { for (const one of [...spares.values()].flat()) stop(one); spares.clear(); };
process.once('exit', cooled);

/**
 * A program run in a process started ahead under the same starting variables, handed the folder, arguments and
 * variables a process started now would get, and watched within the same bounds; undefined when none is held ready,
 * so the caller starts one as before and never waits on one still loading. Each process answers one ask and ends.
 */
export const warmed = (program: string, args: readonly string[], at: { readonly cwd: string; readonly env: NodeJS.ProcessEnv }, bounds: Bounds): Promise<Printed> | undefined => {
  const live = spares.get(program) ?? [], index = live.findIndex((one) => one.loaded && alive(one) && one.boot === bootOf(at.env));
  const spare = index < 0 ? undefined : live.splice(index, 1)[0];
  if (spare === undefined) return undefined;
  void kept(program);
  (spare.child.stdio[3] as Duplex).end(`${JSON.stringify({ cwd: at.cwd, args, env: at.env })}\n`);
  return watched(spare.child, bounds);
};
