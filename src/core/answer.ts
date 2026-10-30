import { createHash } from 'node:crypto';
import { canonical, LOCK } from '@lapxo/topos/wire';
import { valueOf, type Said } from './lock.ts';
import type { authorityAt } from '../ports/host.ts';
import type { Printed } from '../ports/bound.ts';
export type Outcome = { readonly lines: readonly string[] } | { readonly refused: string };
import type { KeyStore } from '../ports/keychain.ts';
import type { Fetched, Prepared } from '../ports/adapters/request.ts';
import type * as Documents from '../ports/documents.ts';
import type { Call } from './read.ts';
import type { AccessAdapter, Answered, Attachment, Choice, Field, Held } from '../access/contract.ts';
import { basename, isAbsolute, resolve, sep } from 'node:path';
import { sayIn } from './surface.ts';

export type Asked = Readonly<Record<string, string | undefined>>;
export interface Context {
  readonly remote?: () => Promise<import('../ports/adapters/remote.ts').RemotePort>;
  readonly packaged?: () => Promise<{ readonly root: string; readonly read: (path: string) => Uint8Array | undefined }>; 
  readonly bundle?: (payload: import('../ports/adapters/bundle.ts').Payload | undefined) => Promise<{ readonly bytes: Uint8Array; readonly digest: string; readonly sources: readonly string[] }>;
  readonly lock: readonly Said[];
  readonly bound: (cwd: string, args: readonly string[]) => Promise<Printed | undefined>;
  readonly roots: () => Promise<readonly string[]>; readonly client: () => string | undefined;
  readonly keys: KeyStore;
  readonly device: (role: string) => string | undefined;
  readonly standing: (place: string) => Promise<{ readonly lines: readonly Said[] } | { readonly refused: string }>;
  readonly authority: (place: string, key: string, kind: string, records: readonly string[], presented?: string) => ReturnType<typeof authorityAt>;
  readonly policy: (place: string) => Promise<{ readonly lines: readonly Said[] } | { readonly refused: string }>;
  readonly world: (place: string, view: string) => Promise<{ readonly lines: readonly Said[] } | { readonly refused: string }>;
  readonly adapter: (origin: string) => Promise<{ readonly prepare: (call: Call, args: Readonly<Record<string, unknown>>, lock: readonly Said[]) => Prepared; readonly post: (url: string, body: Readonly<Record<string, unknown>>, most: number, wait: number, as?: 'form' | 'json') => Promise<Answered>; readonly published: (url: string, digest: string, most: number, wait: number) => Promise<Uint8Array | undefined>; readonly fetched: (url: string, attachment: Attachment | undefined, accept: string | undefined, most: number, wait: number) => Promise<Fetched>; readonly get: (url: string, wait: number) => Promise<{ readonly bytes: Uint8Array; readonly type: string } | undefined> } | undefined>;
  readonly access: (kind: string) => Promise<AccessAdapter | undefined>;
  readonly person: { readonly consent: (message: string, word: string) => Promise<'yes' | 'no' | 'none'>; readonly enter: (title: string, fields: readonly Field[]) => Promise<Held | undefined>; readonly choose: (message: string, choices: readonly Choice[]) => Promise<Held | undefined>; readonly visit: (message: string, to: (back: string) => string | undefined | Promise<string | undefined>) => Promise<Held | undefined> };
  readonly files: { readonly lay: (place: string, rel: string, bytes: Uint8Array) => void; readonly drop: (place: string, rel: string) => void; readonly has: (place: string, rel: string) => boolean; readonly list: (place: string, rel: string) => readonly string[]; readonly read: typeof Documents; readonly take: (path: string) => Uint8Array | undefined; readonly own: (rel: string) => Uint8Array | undefined };
  readonly home: () => string;
  readonly personal: () => string;
  readonly found: (place: string, account: string) => Promise<Outcome>;
  readonly signRoot: (place: string, lot: readonly string[], account: string) => Promise<Outcome>;
  readonly landRoot: (place: string, lot: readonly string[], account: string) => Promise<Outcome>;
  readonly settle: () => Promise<readonly string[]>;
  readonly moved: (place: string) => boolean;
  readonly pinned: (place: string, file: string) => Promise<{ readonly pin: string; readonly bytes: string; readonly lines: readonly Said[] } | { readonly refused: string } | undefined>;
  readonly cache: { readonly keep: (bytes: Uint8Array) => string; readonly held: (digest: string) => Uint8Array | undefined };
  readonly signAs: (place: string, lot: readonly string[], role: string, lines: readonly Said[]) => Promise<Outcome>;
  readonly landAs: (place: string, lot: readonly string[], role: string, lines: readonly Said[]) => Promise<Outcome>;
  readonly land: (place: string, signed: readonly string[]) => Promise<Outcome>;
  readonly told: (place: string, signed: readonly string[]) => Promise<readonly string[]>;
  readonly elicit: (message: string) => Promise<'yes' | 'no' | 'none'>;
  readonly now: () => number;
  readonly machine: () => number;
  readonly begun: number;
}
export type Answer = (asked: Asked, context: Context) => Promise<readonly string[]>;

/** What answers a line of the surface: the module named as the line, in the folder of its family. */
export const answerOf = async (family: 'tools' | 'resources', name: string): Promise<Answer> =>
  ((await import(new URL(`../${family}/${name}${import.meta.url.slice(import.meta.url.lastIndexOf('.'))}`, import.meta.url).href)) as { answer: Answer }).answer;

export const placeOf = async (asked: Asked, context: Context): Promise<string | undefined> => asked['place'] || (await context.roots()).find((root) => context.files.has(root, LOCK) || context.files.has(root, '.bound')) || ((held) => ('refused' in held ? undefined
  : ((named) => (named.length === 1 ? named[0] : undefined))(held.lines.filter((l) => l.scope?.startsWith(`${valueOf(context.lock, 'home/family')}/`) && l.value !== 'withdraw').map((l) => l.value!))))(context.files.has(context.home(), LOCK) ? await context.policy(context.home()) : { refused: '' });
export const inPlace = async (asked: Asked, context: Context, then: (place: string) => Promise<readonly string[]>): Promise<readonly string[]> =>
  ((place) => (place === undefined ? [sayIn(context.lock)('no-place')] : then(place)))(await placeOf(asked, context));
/** The person's yes to exactly what a message says; anything else is what head says of it, and nothing is done. */
export const unless = async (context: Context, message: string): Promise<readonly string[] | undefined> => ((consent) => (consent === 'yes' ? undefined : [sayIn(context.lock)(consent === 'none' ? 'cannot-ask' : 'no-yes')]))(await context.elicit(message));
export const printedOr = (context: Context, printed: Printed | undefined): readonly string[] => (printed === undefined ? [sayIn(context.lock)('unreachable')] : [...printed.out, ...printed.err]);

/** The lines a place stands on, or what head says when bound refused to fold them: a refusal is never an empty standing. */
export const standingOr = async (context: Context, place: string, of: Context['standing'] = context.standing): Promise<{ readonly lines: readonly Said[] } | { readonly said: readonly string[] }> =>
  ((held) => ('refused' in held ? { said: [sayIn(context.lock)('unfolded', { place, why: held.refused })] } : held))(await of(place));
export const inStanding = (asked: Asked, context: Context, then: (place: string, lines: readonly Said[]) => Promise<readonly string[]>, of: Context['standing'] = context.standing): Promise<readonly string[]> => inPlace(asked, context, async (place) => ((held) => ('said' in held ? held.said : then(place, held.lines)))(await standingOr(context, place, of)));

export const baseOf = (lines: readonly Said[]): string => createHash('sha256').update(lines.map((l) => canonical(l)).sort().join('\n')).digest('hex').slice(0, 16);

export const placeNameOf = (place: string): string => basename(place);
export const within = async (context: Context, place: string, at: string): Promise<boolean> => isAbsolute(at) && [place, ...(await context.roots())].some((root) => resolve(at).startsWith(`${resolve(root)}${sep}`));
