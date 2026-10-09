import { execFileSync } from 'node:child_process';
import { plain } from '../keychain.ts';
import type { KeyStore } from '../keychain.ts';

/** Windows PowerShell, reading its whole program from stdin: the password vault of the Credential Manager, an entry by its resource and user. */
const vault = (program: readonly string[]): string => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-'], {
  input: ['$ErrorActionPreference = \'Stop\'', '[void][Windows.Security.Credentials.PasswordVault, Windows.Security.Credentials, ContentType = WindowsRuntime]', '$v = New-Object Windows.Security.Credentials.PasswordVault', ...program, ''].join('\n'),
  encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
});

/** The Windows Credential Manager: the secret travels inside the program head writes to PowerShell's stdin, base64, and comes back on its stdout; never an argument a process list shows. */
export const store = (service: string): KeyStore => ({
  read: (account) => {
    try { return vault([`$r = '${plain(service)}'; $u = '${plain(account)}'`, 'try { $c = $v.Retrieve($r, $u); $c.RetrievePassword(); [Console]::Out.Write($c.Password) } catch { exit 1 }']).trim() || undefined; }
    catch { return undefined; }
  },
  write: (account, secret) => {
    vault([`$r = '${plain(service)}'; $u = '${plain(account)}'; $b = '${Buffer.from(plain(secret)).toString('base64')}'`, 'try { $v.Remove($v.Retrieve($r, $u)) } catch { }',
      '$v.Add((New-Object Windows.Security.Credentials.PasswordCredential($r, $u, [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)))))']);
  },
});
