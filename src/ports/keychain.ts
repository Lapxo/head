import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signerResponseOf } from '@lapxo/topos/wire';
import { spawned } from './process.ts';
import { store as credentialManager } from './stores/credential-manager.ts';
import { store as keychainOfMac } from './stores/keychain.ts';
import { store as secretTool } from './stores/secret-tool.ts';

export interface KeyStore { readonly read: (account: string) => string | undefined; readonly write: (account: string, secret: string) => void; readonly made?: (account: string) => string | undefined; readonly held?: (account: string) => string | undefined }
export const plain = (word: string): string => { if (!/^[\w.@/+=-]+$/.test(word)) throw Error('REFUSE·keychain a name holds more than word characters'); return word; };

/** The secret store this host keeps head's keys in, by the name its lock gives the platform's: one adapter each, every secret crossing a command's stdin and stdout only. Only head's signer opens it for a signing key. */
export const secretsOf = (service: string, kind: string): KeyStore => ((made) => { if (made === undefined) throw Error(`REFUSE·keychain ${kind} is no store head carries`); return made(service); })(({ keychain: keychainOfMac, 'secret-tool': secretTool, 'credential-manager': credentialManager } as Readonly<Record<string, (service: string) => KeyStore>>)[kind]);
const signer = fileURLToPath(new URL(`../signer${import.meta.url.slice(import.meta.url.lastIndexOf('.'))}`, import.meta.url)), half = (mode: string, service: string, account: string, kind: string): string | undefined => { try { return execFileSync(process.execPath, [signer, mode, service, plain(account), kind], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) || undefined; } catch { return undefined; } };
/** The store head's long process is handed: a signing account is refused by name before any command starts, and its key is made, or its public half read, in head's signer, never here; the secrets of access stay this process's, since it calls their APIs. */
export const keychain = (service: string, kind: string, signing: (account: string) => string | undefined): KeyStore => ((keys, guard) => ({ read: (account: string) => keys.read(guard(account)), write: (account: string, secret: string) => keys.write(guard(account), secret), made: (account: string) => half('make', service, account, kind), held: (account: string) => half('exists', service, account, kind) }))(secretsOf(service, kind), (account: string) => ((key) => { if (key !== undefined) throw Error(`REFUSE·keychain ${key} names a signing key: only head's signer reads it`); return account; })(signing(account)));
/** The signing port a host calls for one lot: head's signer started with the key's names alone and the lot on its stdin, within the wait the lock gives bound; what it prints are the signatures, read as the signing-lot contract reads them. */
export const portOf = (service: string, account: string, kind: string, wait: number) => async (lot: { readonly bytes: readonly string[]; readonly keyId: string; readonly algorithm: string }, signal: AbortSignal): Promise<readonly { readonly keyId: string; readonly signature: string }[]> => ((got) => { if (got.code !== 0) throw Error(`REFUSE·signer head's signer did not sign for ${lot.keyId}`); return signerResponseOf(`${got.out.join('\n')}\n`, lot); })(await spawned(process.execPath, [signer, service, plain(account), lot.keyId, lot.algorithm, kind], { input: `${lot.bytes.join('\n')}\n` }, { wait, most: 1 << 20, signal }));
