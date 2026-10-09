import { execFileSync } from 'node:child_process';
import { plain } from '../keychain.ts';
import type { KeyStore } from '../keychain.ts';

/** The Secret Service of a Linux session through libsecret's own command: an entry found by its service and account attributes, the secret crossing stdin and stdout only. */
export const store = (service: string): KeyStore => ({
  read: (account) => {
    try { return execFileSync('secret-tool', ['lookup', 'service', plain(service), 'account', plain(account)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined; }
    catch { return undefined; }
  },
  write: (account, secret) => {
    execFileSync('secret-tool', ['store', `--label=${plain(service)} ${plain(account)}`, 'service', plain(service), 'account', plain(account)], { input: plain(secret), stdio: ['pipe', 'ignore', 'ignore'] });
  },
});
