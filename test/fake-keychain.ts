import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * A stand-in for the system keychain command on PATH, holding a secret per service and account in a test folder; it
 * writes through `-i` from stdin as the real one does, and logs every argument list it was started with. A secret the test
 * seeds is held for any service; one written is held for its own. No real keychain is touched. Beside it the same folder
 * as libsecret's secret-tool, the store the lock names on Linux, and the browser openers of both, logging and opening none.
 */
export const fakeKeychain = (accounts: Readonly<Record<string, string | undefined>>) => {
  const dir = mkdtempSync(join(tmpdir(), 'head-keychain-'));
  const file = (account: string, service = 'ANY') => join(dir, `held-${service.replaceAll('/', '_')}--${account.replaceAll('/', '_')}`);
  for (const [account, secret] of Object.entries(accounts)) writeFileSync(file(account), secret ?? '');
  writeFileSync(join(dir, 'argv'), '');
  writeFileSync(join(dir, 'security'), [
    '#!/bin/sh', `echo "$*" >> "${join(dir, 'argv')}"`,
    `if [ "$1" = -i ]; then read cmd; s=$(printf '%s' "$cmd" | sed -n 's/.* -w \\([^ ]*\\).*/\\1/p'); a=$(printf '%s' "$cmd" | sed -n 's/.* -a \\([^ ]*\\) .*/\\1/p' | tr '/' '_'); v=$(printf '%s' "$cmd" | sed -n 's/.* -s \\([^ ]*\\) .*/\\1/p' | tr '/' '_'); [ -n "$a" ] && [ -n "$v" ] && printf '%s' "$s" > "${dir}/held-$v--$a" && exit 0; exit 45; fi`,
    `if [ "$1" = find-generic-password ]; then a=$(printf '%s' "$3" | tr '/' '_'); v=$(printf '%s' "$5" | tr '/' '_'); for f in "${dir}/held-$v--$a" "${dir}/held-ANY--$a"; do [ -s "$f" ] && cat "$f" && exit 0; done; fi`, 'exit 44', '',
  ].join('\n'));
  chmodSync(join(dir, 'security'), 0o755);
  writeFileSync(join(dir, 'secret-tool'), [
    '#!/bin/sh', `echo "$*" >> "${join(dir, 'argv')}"`,
    `if [ "$1" = store ]; then v=$(printf '%s' "$4" | tr '/' '_'); a=$(printf '%s' "$6" | tr '/' '_'); cat > "${dir}/held-$v--$a" && exit 0; fi`,
    `if [ "$1" = lookup ]; then v=$(printf '%s' "$3" | tr '/' '_'); a=$(printf '%s' "$5" | tr '/' '_'); for f in "${dir}/held-$v--$a" "${dir}/held-ANY--$a"; do [ -s "$f" ] && cat "$f" && exit 0; done; fi`, 'exit 1', '',
  ].join('\n'));
  chmodSync(join(dir, 'secret-tool'), 0o755);
  for (const opener of ['open', 'xdg-open']) {
    writeFileSync(join(dir, opener), ['#!/bin/sh', `echo "$*" >> "${join(dir, 'opened')}"`, 'exit 1', ''].join('\n'));
    chmodSync(join(dir, opener), 0o755);
  }
  return { env: { PATH: `${dir}${delimiter}${process.env['PATH'] ?? ''}` }, held: (account: string, service?: string) => { try { return readFileSync(service === undefined ? join(dir, readdirSync(dir).find((f) => f.endsWith(`--${account.replaceAll('/', '_')}`)) ?? '-') : file(account, service), 'utf8'); } catch { return ''; } }, argv: () => readFileSync(join(dir, 'argv'), 'utf8'), opened: () => { try { return readFileSync(join(dir, 'opened'), 'utf8'); } catch { return ''; } } };
};
