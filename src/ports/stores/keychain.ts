import { execFileSync } from 'node:child_process';
import { plain } from '../keychain.ts';
import type { KeyStore } from '../keychain.ts';

const put = (service: string, account: string, secret: string, update: boolean): boolean => {
  try { execFileSync('security', ['-i'], { input: `add-generic-password ${update ? '-U ' : ''}-a ${plain(account)} -s ${plain(service)} -w ${plain(secret)}\n`, stdio: ['pipe', 'ignore', 'ignore'] }); return true; }
  catch (error) { if (!update && (error as { status?: number }).status === 45) return false; throw Error('REFUSE·keychain/write-unavailable the keychain did not confirm the write'); }
};

/** The macOS keychain through the system's own command: a secret crosses its stdin and stdout only, never an argument a process list shows. */
export const store = (service: string): KeyStore => ({
  read: (account) => {
    try { return execFileSync('security', ['find-generic-password', '-a', plain(account), '-s', plain(service), '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined; }
    catch (error) { if ((error as { status?: number }).status === 44) return undefined; throw Error('REFUSE·keychain/read-unavailable the keychain did not establish whether the account exists'); }
  },
  write: (account, secret) => { put(service, account, secret, true); },
  create: (account, secret) => put(service, account, secret, false),
});
