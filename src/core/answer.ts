import { createHash } from 'node:crypto';
import { canonical } from '@lapxo/topos/wire';
import type { Said } from './lock.ts';
import type { Printed } from '../ports/bound.ts';
export type Outcome = { readonly lines: readonly string[] } | { readonly refused: string };
import type { KeyStore } from '../ports/keychain.ts';
import type { Prepared } from '../ports/adapters/request.ts';
import type { Call } from './read.ts';
import type { AccessAdapter, Answered, Choice, Field, Held } from '../access/contract.ts';
import { basename } from 'node:path';
import { sayIn } from './surface.ts';

export type Asked = Readonly<Record<string, string | undefined>>;
export interface Context {
  readonly lock: readonly Said[];
  readonly bound: (cwd: string, args: readonly string[]) => Promise<Printed | undefined>;
  readonly roots: () => Promise<readonly string[]>;
  readonly keys: KeyStore;
  readonly device: (role: string) => string | undefined;
  readonly standing: (place: string) => Promise<{ readonly lines: readonly Said[] } | { readonly refused: string }>;
  readonly world: (place: string, view: string) => Promise<{ readonly lines: readonly Said[] } | { readonly refused: string }>;
  readonly adapter: (origin: string) => Promise<{ readonly prepare: (call: Call, args: Readonly<Record<string, unknown>>, lock: readonly Said[]) => Prepared; readonly post: (url: string, body: Readonly<Record<string, unknown>>, most: number, wait: number, as?: 'form' | 'json') => Promise<Answered>; readonly published: (url: string, digest: string, most: number, wait: number) => Promise<Uint8Array | undefined>; readonly get: (url: string, wait: number) => Promise<{ readonly bytes: Uint8Array; readonly type: string } | undefined> } | undefined>;
  readonly access: (kind: string) => Promise<AccessAdapter | undefined>;
  readonly person: { readonly consent: (message: string, word: string) => Promise<'yes' | 'no' | 'none'>; readonly enter: (title: string, fields: readonly Field[]) => Promise<Held | undefined>; readonly choose: (message: string, choices: readonly Choice[]) => Promise<Held | undefined>; readonly visit: (message: string, to: (back: string) => string | undefined | Promise<string | undefined>) => Promise<Held | undefined> };
  readonly files: { readonly lay: (place: string, rel: string, bytes: Uint8Array) => void; readonly drop: (place: string, rel: string) => void; readonly has: (place: string, rel: string) => boolean; readonly take: (path: string) => Uint8Array | undefined; readonly own: (rel: string) => Uint8Array | undefined };
  readonly home: () => string;
  readonly found: (place: string, account: string) => Promise<Outcome>;
  readonly signRoot: (place: string, lot: readonly string[], account: string) => Promise<Outcome>;
  readonly landRoot: (place: string, lot: readonly string[], account: string) => Promise<Outcome>;
  readonly pinned: (place: string, file: string) => Promise<{ readonly pin: string; readonly bytes: string; readonly lines: readonly Said[] } | { readonly refused: string } | undefined>;
  readonly cache: { readonly keep: (bytes: Uint8Array) => string; readonly held: (digest: string) => Uint8Array | undefined };
  readonly signAs: (place: string, lot: readonly string[], role: string, lines: readonly Said[]) => Promise<Outcome>;
  readonly landAs: (place: string, lot: readonly string[], role: string, lines: readonly Said[]) => Promise<Outcome>;
  readonly land: (place: string, signed: readonly string[]) => Promise<Outcome>;
  readonly told: (place: string, signed: readonly string[]) => Promise<readonly string[]>;
  readonly elicit: (message: string) => Promise<'yes' | 'no' | 'none'>;
  readonly now: () => number;
  readonly machine: () => number;
}
export type Answer = (asked: Asked, context: Context) => Promise<readonly string[]>;

/** What answers a line of the surface: the module named as the line, in the folder of its family. */
export const answerOf = async (family: 'tools' | 'resources', name: string): Promise<Answer> =>
  ((await import(new URL(`../${family}/${name}${import.meta.url.slice(import.meta.url.lastIndexOf('.'))}`, import.meta.url).href)) as { answer: Answer }).answer;

export const placeOf = async (asked: Asked, context: Context): Promise<string | undefined> => asked['place'] || (await context.roots())[0];
export const inPlace = async (asked: Asked, context: Context, then: (place: string) => Promise<readonly string[]>): Promise<readonly string[]> =>
  ((place) => (place === undefined ? [sayIn(context.lock)('no-place')] : then(place)))(await placeOf(asked, context));
/** The person's yes to exactly what a message says; anything else is what head says of it, and nothing is done. */
export const unless = async (context: Context, message: string): Promise<readonly string[] | undefined> => ((consent) => (consent === 'yes' ? undefined : [sayIn(context.lock)(consent === 'none' ? 'cannot-ask' : 'no-yes')]))(await context.elicit(message));
export const printedOr = (context: Context, printed: Printed | undefined): readonly string[] => (printed === undefined ? [sayIn(context.lock)('unreachable')] : [...printed.out, ...printed.err]);

/** The lines a place stands on, or what head says when bound refused to fold them: a refusal is never an empty standing. */
export const standingOr = async (context: Context, place: string): Promise<{ readonly lines: readonly Said[] } | { readonly said: readonly string[] }> =>
  ((held) => ('refused' in held ? { said: [sayIn(context.lock)('unfolded', { place, why: held.refused })] } : held))(await context.standing(place));

export const baseOf = (lines: readonly Said[]): string => createHash('sha256').update(lines.map((l) => canonical(l)).sort().join('\n')).digest('hex').slice(0, 16);

export const placeNameOf = (place: string): string => basename(place);
