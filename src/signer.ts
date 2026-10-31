#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { newKey, publicOf, signLot } from './ports/keys.ts';
import { secretsOf } from './ports/keychain.ts';

/** The one process that reads a signing secret, and it prints a public half at most: `make` keeps a key made once, `exists` says whether one is kept, else it signs the lot on stdin. */
try {
  const [first = '', ...rest] = process.argv.slice(2), half = first === 'make' || first === 'exists', [service = '', account = '', key = '', algorithm = '', store = 'keychain'] = half ? [rest[0], rest[1], '', '', rest[2]] : [first, ...rest], keys = secretsOf(service, store);
  const kept = keys.read(account) ?? (first === 'make' ? ((made) => { if (keys.create === undefined) throw Error('REFUSE·keychain/create-unsupported the store has no create-if-absent operation'); const created = keys.create(account, made.secret), held = keys.read(account); if (created && held !== made.secret) throw Error('REFUSE·keychain/create-unverified the retained key did not match the newly created key'); return held; })(newKey()) : undefined);
  if (kept === undefined) process.exit(half ? 3 : 1);
  process.stdout.write(half ? publicOf(kept) : signLot(readFileSync(0, 'utf8'), kept, key, algorithm));
} catch (error) { const code = error instanceof Error ? /^REFUSE·(keychain\/[\w-]+)/.exec(error.message)?.[1] : undefined; if (code) process.stderr.write(`${code}\n`); process.exit(code ? 4 : 1); }
