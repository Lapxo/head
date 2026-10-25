import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { canonical, LOCK, parse } from '@lapxo/topos/wire';
import { factsOf, type Said } from '../core/lock.ts';
import type { Outcome } from '../core/answer.ts';
import { spawned } from './process.ts';
import { hosted, hosting, signedIn } from './host.ts';
import type { portOf } from './keychain.ts';
import { cleared, scratchOf } from './scratch.ts';
import { folded } from '../ahead/fold.ts';
import { readingOf } from './reading.ts';
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

/** bound asked in a folder, beside head and never blocking it, within the wait and the bytes head's lock gives it and stopped when the asker cancels: a place or one of its views read through the place's fold host, else a process started now, as for a document, a lot told or a sign: a host is always handed its place first, and bound folds a document only when it is named first; what it read from the temporary folder is removed once it ends, however it ends. */
export const run = async (name: string, cwd: string, args: readonly string[], env: Readonly<Record<string, string>> = {}, signal?: AbortSignal): Promise<Printed | undefined> => { try { return await ((bin, at, bounds) => (bin === undefined ? undefined
  : (args[0] === words.read && (args.length === 1 || (args.length === 3 && args[1] === words.view)) && hosting.installed && !Object.keys(env).length ? hosted(cwd, args, signal) : spawned(process.execPath, [bin, ...args], at, bounds)).then(apart)))(binOf(name), { cwd, env: { ...process.env, ...env } }, { wait: limits.wait, most: limits.most || Number.MAX_SAFE_INTEGER, ...(signal ? { signal } : {}) }); } finally { cleared([...args, ...Object.values(env)]); } };

/** The record bound prints after a refusal's diagnostic, read apart from it: what bound printed is kept whole, the record beside it, and why bound refused is the diagnostic's last line, never the record. */
const recordOf = (line: string): Record<string, string> | undefined => { try { return ((got) => (got?.profile === words.refusal ? got : undefined))(JSON.parse(line) as Record<string, string> | null); } catch { return undefined; } };
const isRecord = (line: string) => line.startsWith('{') && recordOf(line) !== undefined;
const apart = (printed: Printed): Printed => ((record) => (record === undefined ? printed : { ...printed, refusal: recordOf(record)! }))([...printed.err].reverse().find(isRecord));
const why = (printed: Printed | undefined): string | undefined => printed?.err.filter((line) => !isRecord(line)).at(-1);


export type Folded = { readonly lines: readonly Said[] } | { readonly refused: string };
const readOf = (printed: Printed | undefined): Folded => (printed === undefined || printed.code !== 0 ? { refused: why(printed) ?? '' } : { lines: factsOf(printed.out) });
/** Native identities and expected-identity results come from the same public CLI contract. Without it, read fresh. */
const nativeView = (name: string, place: string, view: string, signal?: AbortSignal): Promise<Folded> => {
  const read = async (expected?: string): Promise<Folded> => {
    if (expected === undefined) return readOf(await run(name, place, [words.read, words.view, view], {}, signal));
    const result = readingOf(await run(name, place, [words.read, words.view, `${words.identity}@${view}@${expected}`], {}, signal), view, expected);
    return 'refused' in result ? result : { lines: factsOf(result.text!.split('\n')) };
  };
  return !words.identity ? read() : folded(`${name}/${view}`, place, async () => { const result = readingOf(await run(name, place, [words.read, words.view, `${words.identity}@${view}`], {}, signal), view); return 'refused' in result ? undefined : result.identity; }, read);
};

/** Read normative standing plus authenticated device evidence; ambiguous device history refuses. */
export const policyAt = async (name: string, place: string, signal?: AbortSignal): Promise<Folded> => ((folded) => ('refused' in folded || folded.lines.some((line) => line.scope === words.profile) ? folded
  : { refused: `REFUSE·act the place declares no ${words.profile}: land would print nothing of what it admits, so head lands nothing there; its root can land the local-act@1 profile and view/act` }))(await nativeView(name, place, words.standing, signal));

export const standingAt = async (name: string, place: string, devicesOf: (lines: readonly Said[]) => readonly string[], isHistory: (line: Said) => boolean, signal?: AbortSignal): Promise<Folded> => {
  const [folded, evidence] = await Promise.all([policyAt(name, place, signal), nativeView(name, place, words.evidence, signal)]);
  if ('refused' in folded) return folded;
  if ('refused' in evidence) return evidence;
  const ids = new Set(devicesOf(folded.lines)), own = evidence.lines.filter((line) => ids.has(line.by ?? ''));
  const key = (line: Said) => `${line.scope} ${line.measure}`, attested = own.filter((line) => !isHistory(line));
  const unfolded = attested.find((line) => line.value === 'withdraw' || attested.filter((other) => key(other) === key(line)).length > 1 || folded.lines.some((other) => key(other) === key(line)));
  return unfolded === undefined ? { lines: [...folded.lines, ...own] }
    : { refused: `REFUSE·standing ${unfolded.by} attests ${key(unfolded)} more than once, withdrawn, or beside the place's own line: folding a device key's lines is bound's, and bound publishes no view of it` };
};

const lotFile = (lines: readonly string[]): string => scratchOf('head-lot-', 'lot.bound', `${lines.join('\n')}\n`);
/** A sign or a land: in a host of its own for this one call, signed by head's signer through the port of the key it names, the lot handed in as the host's input. */
type Port = ReturnType<typeof portOf>;
const through = (place: string, verb: string, lot: readonly string[] | undefined, key?: string, signer?: string, port?: Port, signal?: AbortSignal) => signedIn(place, [verb, ...(key ? [words.key, key, words.signer, signer!] : [])], lot, new Map(key && port ? [[key, { name: signer!, sign: port }]] : []), key, signal).then(apart);

export const sign = async (_name: string, place: string, lot: readonly string[], key: string, signer: string, port: Port, signal?: AbortSignal): Promise<Outcome> =>
  ((got) => (got !== undefined && got.code === 0 ? { lines: got.out.filter((line) => parse(line).kind === 'fact') } : { refused: why(got) ?? '' }))(await through(place, words.sign, lot, key, signer, port, signal));

/** A lot signed and landed in one process, its result read from what bound printed of the committed act: the records it admitted, never the receipt beside them; a place that declares no act result is refused by name. */
/** A place's receipts rendered beside its lock, so bound alone checks the place: nothing when they closed, else why they did not. */
export const closing = async (name: string, place: string, signal?: AbortSignal): Promise<string | undefined> => ((got) => (got !== undefined && got.code === 0 ? undefined : why(got) ?? 'nothing printed'))(await run(name, place, [words.read, words.view, words.receipts], {}, signal));

/** A place's own lines in the person's words, beside its lock, the text they read and share: each line head lands at the person's at, drafted with no signature, gone with its withdraw. Bound reads the file as it reads the place, so it is written with the land, never while a fold runs. Set from head's lock. */
export const birth = { at: '', file: '' }, birthed = (place: string, lot: readonly string[]): void => { const [file, mine] = [join(place, birth.file), factsOf(lot).filter((l) => birth.file && l['at']?.startsWith(birth.at))], bare = (l: Said) => JSON.stringify(Object.entries(l).filter(([k]) => !['about', 'value', 'sig', 'epoch', 'by'].includes(k)).sort());
  if (mine.length) writeFileSync(file, [...(existsSync(file) ? factsOf(readFileSync(file, 'utf8').split('\n')) : []).filter((k) => !mine.some((m) => bare(m) === bare(k))), ...mine.filter((m) => m['value'] !== 'withdraw')].map(({ sig: _sig, epoch: _epoch, ...l }) => `${canonical({ ...l, by: 'target' })}\n`).join('')); };

export const landAct = async (_name: string, place: string, lot: readonly string[], key: string, signer: string, port: Port, signal?: AbortSignal): Promise<Outcome> =>
  ((got) => {
    if (got === undefined || got.code !== 0) return { refused: why(got) ?? '' };
    const at = got.out.findIndex((line) => line.startsWith(words.act));
    return at < 0 ? { refused: `REFUSE·act bound printed no act result, and the place declares ${words.profile}: what was admitted is bound's to say` }
      : (birthed(place, lot), { lines: got.out.slice(at + 1).filter((line) => parse(line).kind === 'fact').slice(0, -1) });
  })(await through(place, words.land, lot, key, signer, port, signal));

export const land = async (_name: string, place: string, signed: readonly string[], signal?: AbortSignal): Promise<Outcome> =>
  ((got) => (got !== undefined && got.code === 0 ? (birthed(place, signed), { lines: signed }) : { refused: why(got) ?? '' }))(await through(place, words.land, signed, undefined, undefined, undefined, signal));

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

export const founded = async (_name: string, place: string, key: string, signer: string, port: Port, signal?: AbortSignal): Promise<Outcome> =>
  ((got) => (got !== undefined && got.code === 0 ? (birthed(place, readFileSync(join(place, LOCK), 'utf8').split('\n')), { lines: got.out }) : { refused: why(got) ?? '' }))(await through(place, words.land, undefined, key, signer, port, signal));

export const words = { read: '', view: '', sign: '', land: '', key: '', signer: '', pin: '', topos: '', standing: '', evidence: '', act: '', profile: '', receipts: '', refusal: '', identity: '' };

export const settledView = async (name: string, place: string, view: string, signal?: AbortSignal): Promise<Folded> => readOf(await run(name, place, [words.read, words.view, view], {}, signal));
