import type { Fields } from '../core/read.ts';
export type { Fields };

export interface Field { readonly name: string; readonly label: string; readonly secret: boolean; readonly options?: readonly { readonly value: string; readonly label: string }[] }
export type Held = Readonly<Record<string, string>>;
export interface Choice { readonly name: string; readonly label?: string; readonly options?: readonly { readonly value: string; readonly label: string }[] }
export interface Attachment { readonly headers: Held; readonly query: Held }
/** A secret obtained by a declared flow: the secret, when it stops holding and what renews it, when the flow says; manual when a person entered it with no flow declared. */
export interface Obtained { readonly secret: string; readonly expires?: number; readonly renew?: string; readonly manual?: true }
export type Answered = { readonly status: number; readonly json: unknown } | undefined;

/**
 * What the host hands an access adapter to run its flow with: the declared lines of its scheme — by the step below it they
 * are said under — the origin the source is reached at, how many secrets the place's root lets it ask, the values a flow
 * may name, and the person; never a shell, never a file.
 */
export interface Want {
  readonly place: string; readonly source: string; readonly scheme: string; readonly params: Fields; readonly scopes: readonly string[]; readonly now: number;
  readonly declared: Readonly<Record<string, Fields>>; readonly origin: string; readonly secrets: number; readonly values: readonly string[]; readonly host: Readonly<Record<string, string>>;
  readonly enter: (title: string, fields: readonly Field[]) => Promise<Held | undefined>;
  readonly consent: (message: string) => Promise<boolean>;
  readonly choose: (message: string, choices: readonly Choice[]) => Promise<Held | undefined>;
  readonly visit: (message: string, to: (back: string) => string | undefined | Promise<string | undefined>) => Promise<Held | undefined>;
  readonly form: (source: string, operation: string) => Fields;
  readonly call: (source: string, operation: string, body: unknown, attachment?: Attachment) => Promise<Answered>;
  readonly post: (url: string, body: Readonly<Record<string, unknown>>, as?: 'form' | 'json') => Promise<Answered>;
}

/** A kind of access, executed by the host: how its secret rides a request, and the flow that obtains it. */
export interface AccessAdapter { readonly attach: (secret: string, params: Fields) => Attachment; readonly obtain: (want: Want) => Promise<Obtained | { readonly refused: string; readonly input?: string }> }

export const jsonOf = (body: Uint8Array | string): unknown => { try { return JSON.parse(typeof body === 'string' ? body : Buffer.from(body).toString('utf8')) as unknown; } catch { return undefined; } };
