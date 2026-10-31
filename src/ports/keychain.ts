import { fileURLToPath } from 'node:url';
import { signerResponseOf } from '@lapxo/topos/wire';
import { spawned, type Bounds } from './process.ts';
import { nativeHostEnvironment } from '@lapxo/bound/host';
import { store as credentialManager } from './stores/credential-manager.ts';
import { store as keychainOfMac } from './stores/keychain.ts';
import { store as secretTool } from './stores/secret-tool.ts';

export interface KeyStore { readonly read: (account: string) => string | undefined; readonly write: (account: string, secret: string) => void; readonly create?: (account: string, secret: string) => boolean; readonly made?: (account: string) => string | undefined | Promise<string | undefined>; readonly held?: (account: string) => string | undefined | Promise<string | undefined> }
export const plain = (word: string): string => { if (!/^[\w.@/+=-]+$/.test(word)) throw Error('REFUSE·keychain a name holds more than word characters'); return word; };
/** Only the failure identifier crosses a door; store output and exception bodies never do. */
export const keyFailureOf = (error: unknown): string | undefined => error instanceof Error ? /^REFUSE·((?:keychain|signer)\/[\w-]+)/.exec(error.message)?.[1] : undefined;

/** The secret store this host keeps head's keys in, by the name its lock gives the platform's: one adapter each, every secret crossing a command's stdin and stdout only. Only head's signer opens it for a signing key. */
export const secretsOf = (service: string, kind: string): KeyStore => ((made) => { if (made === undefined) throw Error(`REFUSE·keychain ${kind} is no store head carries`); return made(service); })(({ keychain: keychainOfMac, 'secret-tool': secretTool, 'credential-manager': credentialManager } as Readonly<Record<string, (service: string) => KeyStore>>)[kind]);
const signer = fileURLToPath(new URL(`../signer${import.meta.url.slice(import.meta.url.lastIndexOf('.'))}`, import.meta.url));
const half = async (mode: string, service: string, account: string, kind: string, bounds: Bounds): Promise<string | undefined> => {
  if (!Number.isSafeInteger(bounds.wait) || bounds.wait < 1 || !Number.isSafeInteger(bounds.most) || bounds.most < 1) throw Error('REFUSE·signer/budget');
  const current = () => { if (bounds.signal?.aborted) throw Error('REFUSE·signer/cancelled'); };
  current();
  const got = await spawned(process.execPath, [signer, mode, service, plain(account), kind], { env: nativeHostEnvironment({ ...process.env }) }, bounds);
  current();
  if (got.code === 3) return undefined;
  if (got.code === 0 && got.err.length === 0 && got.out.length === 1 && /^[A-Za-z0-9+/=]+$/.test(got.out[0]!)) return got.out[0];
  const code = got.code === -1 && got.err.at(-1) === `waited ${bounds.wait} ms` ? 'signer/timeout' : got.code === -1 && got.err.at(-1) === `printed more than ${bounds.most} bytes` ? 'signer/output-budget' : got.code === 4 && got.err.length === 1 && /^keychain\/[\w-]+$/.test(got.err[0]!) ? got.err[0] : 'signer/unavailable';
  throw Error(`REFUSE·${code} head's signer did not establish the public key`);
};
/** The store head's long process is handed: a signing account is refused by name before any command starts, and its key is made, or its public half read, in head's signer, never here; the secrets of access stay this process's, since it calls their APIs. */
export const keychain = (service: string, kind: string, signing: (account: string) => string | undefined, bounds: Bounds, observed: (account: string, key: string | undefined) => void = () => undefined): KeyStore => ((keys, guard) => ({ read: (account: string) => keys.read(guard(account)), write: (account: string, secret: string) => keys.write(guard(account), secret), made: (account: string) => half('make', service, account, kind, bounds).then(key => { observed(account, key); return key; }), held: (account: string) => half('exists', service, account, kind, bounds).then(key => { observed(account, key); return key; }) }))(secretsOf(service, kind), (account: string) => ((key) => { if (key !== undefined) throw Error(`REFUSE·keychain ${key} names a signing key: only head's signer reads it`); return account; })(signing(account)));
/** The signing port a host calls for one lot: head's signer started with the key's names alone and the lot on its stdin, within the wait the lock gives bound; what it prints are the signatures, read as the signing-lot contract reads them. */
export const portOf = (service: string, account: string, kind: string, wait: number) => async (lot: { readonly bytes: readonly string[]; readonly keyId: string; readonly algorithm: string }, signal: AbortSignal): Promise<readonly { readonly keyId: string; readonly signature: string }[]> => ((got) => { if (got.code !== 0) throw Error(`REFUSE·signer head's signer did not sign for ${lot.keyId}`); return signerResponseOf(`${got.out.join('\n')}\n`, lot); })(await spawned(process.execPath, [signer, service, plain(account), lot.keyId, lot.algorithm, kind], { input: `${lot.bytes.join('\n')}\n`, env: nativeHostEnvironment({ ...process.env }) }, { wait, most: 1 << 20, signal }));
