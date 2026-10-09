import { store as credentialManager } from './stores/credential-manager.ts';
import { store as keychainOfMac } from './stores/keychain.ts';
import { store as secretTool } from './stores/secret-tool.ts';

export interface KeyStore { readonly read: (account: string) => string | undefined; readonly write: (account: string, secret: string) => void }

export const plain = (word: string): string => { if (!/^[\w.@/+=-]+$/.test(word)) throw Error('REFUSE·keychain a name holds more than word characters'); return word; };

/** The secret store this host keeps head's keys in, by the name its lock gives the platform's: one adapter each, every secret crossing a command's stdin and stdout only. */
export const keychain = (service: string, kind: string): KeyStore => ((made) => {
  if (made === undefined) throw Error(`REFUSE·keychain ${kind} is no store head carries`);
  return made(service);
})(({ keychain: keychainOfMac, 'secret-tool': secretTool, 'credential-manager': credentialManager } as Readonly<Record<string, (service: string) => KeyStore>>)[kind]);
