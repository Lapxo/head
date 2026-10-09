import { execFileSync } from 'node:child_process';
import { plain } from '../keychain.ts';
import type { KeyStore } from '../keychain.ts';

/** The macOS keychain through the system's own command: a secret crosses its stdin and stdout only, never an argument a process list shows. */
export const store = (service: string): KeyStore => ({
  read: (account) => {
    try { return execFileSync('security', ['find-generic-password', '-a', plain(account), '-s', plain(service), '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined; }
    catch { return undefined; }
  },
  write: (account, secret) => {
    execFileSync('security', ['-i'], { input: `add-generic-password -U -a ${plain(account)} -s ${plain(service)} -w ${plain(secret)}\n`, stdio: ['pipe', 'ignore', 'ignore'] });
  },
});
