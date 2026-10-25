import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { installedHostInstrument, nativeHostEnvironment, startNativeHost, type NativeCommandHost } from '@lapxo/bound/host';
import type { NativeHostOptions } from '@lapxo/bound/host';
import type { Printed } from './process.ts';
import { members, valueOf, type Said } from '../core/lock.ts';

/** What a place's fold host is held to, from head's lock: the installed instrument it must be, how long it stays idle and lives, and its limits. */
export const hosting = { installed: '', idle: 0, life: 0, wait: 0, bytes: 0, heap: 0, queued: 0, http: undefined as NativeHostOptions['http'] };
/** Receiver permissions and work budgets are declared by head's own lock, never inferred from a redirect. */
export const configureHost = (lock: readonly Said[], bounds: { readonly wait: number; readonly most: number }): void => { Object.assign(hosting, { installed: valueOf(lock, 'dep/bound/installed'), wait: bounds.wait, bytes: bounds.most, ...Object.fromEntries(['idle', 'life', 'heap', 'queued'].map((k) => [k, Number(valueOf(lock, `bound/host/${k}`).split('..')[1])])), http: { origins: members(valueOf(lock, 'bound/receiver/origins')), redirects: { maxRedirects: Number(valueOf(lock, 'bound/receiver/redirects').split('..')[1]), headerBytes: Number(valueOf(lock, 'bound/receiver/header-bytes').split('..')[1]) } } }); };

const root = dirname(createRequire(import.meta.url).resolve('@lapxo/bound/package.json'));
const walk = (at: string): string[] => (statSync(at).isDirectory() ? readdirSync(at).flatMap((e) => walk(join(at, e))) : [at]);
/** Every file of the installed bound by its coordinate and digest: what its identity is computed from, and what is checked again before each call. */
const inventory = (at: string) => walk(at).map((f) => ({ coordinate: relative(at, f).split(sep).join('/'), digest: `sha256:${createHash('sha256').update(readFileSync(f)).digest('hex')}` })).sort((a, b) => (a.coordinate < b.coordinate ? -1 : 1));
interface Held { readonly host: NativeCommandHost; readonly members: string; readonly born: number; readonly scratch: string; busy: number; idle?: ReturnType<typeof setTimeout> }
/** The hosts held, those starting, those closing — a place gets its next host once its last one is gone — and the folders head made for their scratch, each removed once its host is. */
const [live, starting, closing, scratches] = [new Map<string, Held>(), new Map<string, Promise<Held>>(), new Map<string, Promise<void>>(), new Set<string>()];
const cleared = (dir: string) => { rmSync(dir, { recursive: true, force: true }); scratches.delete(dir); };
const shut = (at: string): void => { const one = live.get(at); live.delete(at); if (one) { clearTimeout(one.idle); closing.set(at, one.host.close().catch(() => undefined).finally(() => { cleared(one.scratch); closing.delete(at); })); } };
/** Every host closed, its scratch removed with it: whenever a caller asks, and when head ends, its scratch then removed at once, whatever its host is still doing. */
export const cooled = (): void => { for (const at of [...live.keys()]) shut(at); };
/** The process a place's fold host runs as, while one is held for it. */
export const hostOf = (place: string): number | undefined => live.get(realpathSync(place))?.host.pid;
process.once('exit', () => { cooled(); for (const dir of [...scratches]) cleared(dir); });

/** A host started on a place, on the installed instrument the lock pins and in a scratch folder of head's own; with signers only for one call's sign or land. */
const opened = async (at: string, from: string, signers?: NativeHostOptions['signers']): Promise<Held> => {
  const members = inventory(from), instrument = installedHostInstrument({ directory: from, shape: 'package', members, exports: [['exports', './engine', 'default']], pins: [], limits: { members: 4096, bytes: 1 << 27, responseBytes: 1 << 22 } }, join(from, 'dist/cli/verb.js'));
  const scratch = mkdtempSync(join(tmpdir(), 'head-host-'));
  scratches.add(scratch);
  const host = await startNativeHost({ place: at, instrument, expectedInstrument: hosting.installed, environment: nativeHostEnvironment({ ...process.env }), scratchParent: scratch, ...(hosting.http ? { http: hosting.http } : {}), ...(signers ? { signers } : {}), limits: { requestBytes: hosting.bytes, responseBytes: hosting.bytes, timeoutMs: hosting.wait, heapMiB: hosting.heap, queuedRequests: hosting.queued } }).catch((e: unknown) => { cleared(scratch); throw e; });
  return { host, members: JSON.stringify(members), born: Date.now(), scratch, busy: 0 };
};
const started = async (at: string, from: string): Promise<Held> => ((one) => (live.set(at, one), one))(await opened(at, from));
const lines = (text: string) => text.split('\n').filter(Boolean), refused = (why: string): Printed => ({ code: -1, out: [], err: [why] });

/**
 * A read of a place's view through the place's own fold host, which only folds and never holds a signer: started on the first
 * read, kept while it is asked within its idle and its life, the installed bound checked file by file before every call.
 * A refusal, an error or a changed instrument closes it, and the next read starts another.
 */
export const hosted = async (place: string, args: readonly string[], signal?: AbortSignal, from = root): Promise<Printed> => {
  if (args[0] !== 'fold') return refused(`REFUSE·host a place's fold host only folds, and never holds a signer: ${args[0]} goes to a process of its own`);
  const at = realpathSync(place), was = live.get(at);
  if (was !== undefined && Date.now() - was.born > hosting.life * 1000) shut(at);
  let one: Held;
  try { await closing.get(at); one = live.get(at) ?? await (starting.get(at) ?? ((p) => (starting.set(at, p), p))(started(at, from).finally(() => starting.delete(at)))); } catch (e) { return refused((e as Error).message); }
  if (JSON.stringify(inventory(from)) !== one.members) { shut(at); return refused(`REFUSE·host the installed bound changed after its host started, so it is no longer ${hosting.installed}: the host is closed, and nothing was read`); }
  clearTimeout(one.idle); one.busy += 1;
  try { const got = await one.host.request({ verb: 'fold', args: args.slice(1) }, signal); if (got.status !== 0) shut(at); return { code: got.status, out: lines(got.stdout), err: lines(got.stderr) }; }
  catch (e) { shut(at); return refused((e as Error).message); }
  finally { one.busy -= 1; if (one.busy === 0 && live.get(at) === one) one.idle = setTimeout(() => shut(at), hosting.idle * 1000).unref(); }
};

/**
 * A sign or a land in a host of its own, started for this one call with the signers the lock names and closed once it
 * answers: the signer never outlives the call it signed for. The place's fold host is closed first, a place having one
 * host at a time; the lot goes in as the host's input, never a file of head's.
 */
export const signedIn = async (place: string, args: readonly string[], lot: readonly string[] | undefined, signers: NonNullable<NativeHostOptions['signers']>, keyId?: string, signal?: AbortSignal, from = root): Promise<Printed> => {
  const at = realpathSync(place);
  shut(at); await closing.get(at);
  let one: Held;
  try { one = await opened(at, from, signers); } catch (e) { return refused((e as Error).message); }
  try { const got = await one.host.request({ verb: args[0] as 'sign' | 'land', args: [...(lot ? ['@input/lot.bound'] : []), ...args.slice(1)], ...(lot ? { inputs: [{ name: 'lot.bound', text: `${lot.join('\n')}\n` }] } : {}), ...(keyId ? { signer: keyId } : {}) }, signal); return { code: got.status, out: lines(got.stdout), err: lines(got.stderr) }; }
  catch (e) { return refused((e as Error).message); }
  finally { await one.host.close().catch(() => undefined); cleared(one.scratch); }
};
