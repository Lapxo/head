import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawned } from '../src/ports/process.ts';
import type { Printed } from '../src/ports/process.ts';
import { hosted, hosting, configureHost } from '../src/ports/host.ts';
import { valueOf } from '../src/core/lock.ts';
import { registryFor } from './signers.ts';
import { born, line, lock } from './place.ts';
import { offline } from './worlds.ts';

/** The worlds served from the test's own bytes, as the suite serves them to head: the processes head starts ahead start under the same variables. */
Object.assign(process.env, offline());
const manifest = createRequire(import.meta.url).resolve('@lapxo/bound/package.json');
export const bin = join(dirname(manifest), Object.values((JSON.parse(readFileSync(manifest, 'utf8')) as { bin: Record<string, string> }).bin)[0]!);
export const bounds = { wait: 60_000, most: 1 << 24 };
/** A place's fold host held to head's own lines, as head holds it. */
configureHost(lock, bounds);

/** One place, laid as many times as asked: each copy the same bytes, its root key and its signer the same, so what bound does in one it does in each. */
export const twins = (n: number) => {
  const { place, keychain } = born(undefined, [], null, true, 'tracker', false);
  const lot = join(mkdtempSync(join(tmpdir(), 'head-warm-lot-')), 'lot.bound');
  writeFileSync(lot, `${line('allow/read', 'until', '2999-12-31')}\n`);
  const env = { ...process.env, ...keychain.env, BOUND_SIGNERS: registryFor('keychain', '@lapxo/head', 'person', 'person', 'ed25519:era1') };
  const copies = Array.from({ length: n }, (_, i) => ((at) => { cpSync(place, at, { recursive: true }); return realpathSync(at); })(join(mkdtempSync(join(tmpdir(), `head-warm-${i}-`)), 'place')));
  return { copies, env, asks: [['fold', '--as', 'lines'], ['fold', '--as', 'evidence'], ['land', lot, '--key', 'person', '--signer', 'keychain'], ['fold', '--as', 'evidence'], ['fold', '--as', 'receipts'], ['fold', '--check']] };
};

/** An ask of bound: a process started as it is asked, or a read through the place's fold host; a land is never a host's, and is started as asked either way. What it printed, and how long it took once asked. */
export const asked = async (how: 'cold' | 'warm', cwd: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<{ printed: Printed; ms: number }> => {
  const t = performance.now(), printed = await (how === 'warm' && args[0] === 'fold' ? hosted(cwd, args) : spawned(process.execPath, [bin, ...args], { cwd, env }, bounds));
  return { printed, ms: performance.now() - t };
};

/**
 * Bytes with the time they measured taken out, and the folder they were made in named by one word: what is left is what
 * was asked and answered. A beat line is time alone, and leaves whole: a ledger holds one line once, so two beats that
 * measured the same milliseconds are one line, and how many there are is the clock's.
 */
export const timeless = (text: string, at: string) => text.replaceAll(at, '<place>').replace(/^bound-lock\/1 [^\n]* measure=ms [^\n]*scope=beat\/[^\n]*\n?/gm, '').replace(/\b\d+(\.\d+)? ?(ms|s)\b/g, '<time>')
  .replace(/\b\d{13}-(\d+)\b/g, '<mtime>-$1').replace(/"s":\d+(\.\d+)?/g, '"s":<time>');
const files = (at: string, dir = ''): readonly string[] => readdirSync(join(at, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(at, join(dir, e.name)) : [join(dir, e.name)])).sort();
export const tree = (at: string) => Object.fromEntries(files(at).map((f) => [f, timeless(readFileSync(join(at, f), 'latin1'), at)]));
