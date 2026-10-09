import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from '@lapxo/topos/wire';
import type { Said } from '../core/lock.ts';
import type { Outcome } from '../core/answer.ts';
import { spawned } from './process.ts';
import type { Printed } from './process.ts';
export type { Printed };

const binOf = (name: string): string | undefined => {
  try {
    const manifest = createRequire(import.meta.url).resolve(join(name, 'package.json'));
    const entry = Object.values((JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: Record<string, string> }).bin ?? {})[0];
    return entry === undefined ? undefined : join(dirname(manifest), entry);
  } catch { return undefined; }
};

export const limits = { wait: 0, most: 0 };

/** bound run as a process in a folder, beside head and never blocking it, within the wait and the bytes head's lock gives it and stopped when the asker cancels. */
export const run = async (name: string, cwd: string, args: readonly string[], env: Readonly<Record<string, string>> = {}, signal?: AbortSignal): Promise<Printed | undefined> => ((bin) => (bin === undefined ? undefined
  : spawned(process.execPath, [bin, ...args], { cwd, env: { ...process.env, ...env } }, { wait: limits.wait, most: limits.most || Number.MAX_SAFE_INTEGER, ...(signal ? { signal } : {}) })))(binOf(name));

export type Folded = { readonly lines: readonly Said[] } | { readonly refused: string };
const facts = (out: readonly string[]): readonly Said[] => out.flatMap((line) => ((got) => (got.kind === 'fact' ? [got.value.fields] : []))(parse(line)));
const readOf = (printed: Printed | undefined): Folded => (printed === undefined || printed.code !== 0 ? { refused: printed?.err.at(-1) ?? '' } : { lines: facts(printed.out) });

/**
 * The lines a place stands on, from bound's public views alone: its folded normative standing (the lines view), and from
 * its authenticated evidence what this device's own keys signed. Receipts are history, each kept as it was made; any other
 * line of a device key, the person's own attestation, stands only while it is the one line of its scope and measure,
 * unwithdrawn and beside no line of the place's own: anything else needs a fold bound does not publish, and is refused by
 * name. A place whose land prints no act result is refused before anything lands in it. Any refusal of bound is no standing.
 */
export const standingAt = async (name: string, place: string, devicesOf: (lines: readonly Said[]) => readonly string[], isHistory: (line: Said) => boolean, signal?: AbortSignal): Promise<Folded> => {
  const folded = readOf(await run(name, place, [words.read, words.view, words.standing], {}, signal));
  if ('refused' in folded) return folded;
  if (!folded.lines.some((line) => line.scope === words.profile)) return { refused: `REFUSE·act the place declares no ${words.profile}: land would print nothing of what it admits, so head lands nothing there; its root can land the local-act@1 profile and view/act` };
  const evidence = readOf(await run(name, place, [words.read, words.view, words.evidence], {}, signal));
  if ('refused' in evidence) return evidence;
  const ids = new Set(devicesOf(folded.lines)), own = evidence.lines.filter((line) => ids.has(line.by ?? ''));
  const key = (line: Said) => `${line.scope} ${line.measure}`, attested = own.filter((line) => !isHistory(line));
  const unfolded = attested.find((line) => line.value === 'withdraw' || attested.filter((other) => key(other) === key(line)).length > 1 || folded.lines.some((other) => key(other) === key(line)));
  return unfolded === undefined ? { lines: [...folded.lines, ...own] }
    : { refused: `REFUSE·standing ${unfolded.by} attests ${key(unfolded)} more than once, withdrawn, or beside the place's own line: folding a device key's lines is bound's, and bound publishes no view of it` };
};

const lotFile = (lines: readonly string[]): string => ((at) => { writeFileSync(at, `${lines.join('\n')}\n`); return at; })(join(mkdtempSync(join(tmpdir(), 'head-lot-')), 'lot.bound'));

export const sign = async (name: string, place: string, lot: readonly string[], key: string, signer: string, env: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<Outcome> =>
  ((got) => (got !== undefined && got.code === 0 ? { lines: got.out.filter((line) => parse(line).kind === 'fact') } : { refused: got?.err.at(-1) ?? '' }))(await run(name, place, [words.sign, lotFile(lot), words.key, key, words.signer, signer], env, signal));

/** A lot signed and landed in one process, its result read from what bound printed of the committed act: the records it admitted, never the receipt beside them; a place that declares no act result is refused by name. */
export const landAct = async (name: string, place: string, lot: readonly string[], key: string, signer: string, env: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<Outcome> =>
  ((got) => {
    if (got === undefined || got.code !== 0) return { refused: got?.err.at(-1) ?? '' };
    const at = got.out.findIndex((line) => line.startsWith(words.act));
    return at < 0 ? { refused: `REFUSE·act bound printed no act result, and the place declares ${words.profile}: what was admitted is bound's to say` }
      : { lines: got.out.slice(at + 1).filter((line) => parse(line).kind === 'fact').slice(0, -1) };
  })(await run(name, place, [words.land, lotFile(lot), words.key, key, words.signer, signer], env, signal));

export const land = async (name: string, place: string, signed: readonly string[], signal?: AbortSignal): Promise<Outcome> =>
  ((got) => (got !== undefined && got.code === 0 ? { lines: signed } : { refused: got?.err.at(-1) ?? '' }))(await run(name, place, [words.land, lotFile(signed)], {}, signal));

export const told = async (name: string, place: string, signed: readonly string[], view: string, signal?: AbortSignal): Promise<readonly string[]> =>
  ((got) => [...(got?.out ?? []), ...(got?.err ?? [])])(await run(name, place, [words.read, words.view, view, lotFile(signed)], {}, signal));

export const pinnedAt = async (name: string, place: string, file: string, signal?: AbortSignal): Promise<{ readonly pin: string; readonly bytes: string; readonly lines: readonly Said[] } | { readonly refused: string } | undefined> => {
  const printed = await run(name, place, [words.read, file], {}, signal);
  const read = readOf(printed);
  if ('refused' in read) return read;
  const pin = printed!.out.find((line) => line.startsWith(words.pin))?.slice(words.pin.length);
  const bytes = printed!.out.filter((line) => line.startsWith(words.topos)).map((line) => `${line.slice(words.topos.length)}\n`).join('');
  return pin === undefined || !bytes ? undefined : { pin, bytes, lines: read.lines };
};

export const founded = async (name: string, place: string, key: string, signer: string, env: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<Outcome> =>
  ((got) => (got !== undefined && got.code === 0 ? { lines: got.out } : { refused: got?.err.at(-1) ?? '' }))(await run(name, place, [words.land, words.key, key, words.signer, signer], env, signal));

export const words = { read: '', view: '', sign: '', land: '', key: '', signer: '', pin: '', topos: '', standing: '', evidence: '', act: '', profile: '' };

export const settledView = async (name: string, place: string, view: string, signal?: AbortSignal): Promise<Folded> => readOf(await run(name, place, [words.read, words.view, view], {}, signal));
