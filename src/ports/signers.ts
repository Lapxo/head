import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The host's registry bound reads to bind a declared signer name to a program: head's own signer, started by this node,
 * told the keychain service, the account its secret is kept under, the key it signs as, the algorithm and the store this
 * host keeps secrets in. It holds no secret; it lives beside nothing a repository ships.
 */
export const registryFor = (name: string, service: string, account: string, key: string, algorithm: string, store = 'keychain'): string => {
  const at = join(mkdtempSync(join(tmpdir(), 'head-signers-')), 'signers.json');
  writeFileSync(at, JSON.stringify({ [name]: { kind: 'command', executable: process.execPath, args: [fileURLToPath(new URL(`../signer${import.meta.url.slice(import.meta.url.lastIndexOf('.'))}`, import.meta.url)), service, account, key, algorithm, store] } }));
  return at;
};
