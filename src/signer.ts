#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { newKey, publicOf, signLot } from './ports/keys.ts';
import { secretsOf } from './ports/keychain.ts';

/** The one process that reads a signing secret, and it prints a public half at most: `make` keeps a key made once, `exists` says whether one is kept, else it signs the lot on stdin. */
const [first = '', ...rest] = process.argv.slice(2), half = first === 'make' || first === 'exists', [service = '', account = '', key = '', algorithm = '', store = 'keychain'] = half ? [rest[0], rest[1], '', '', rest[2]] : [first, ...rest], keys = secretsOf(service, store);
const kept = keys.read(account) ?? (first === 'make' ? ((made) => { keys.write(account, made.secret); return keys.read(account) === made.secret ? made.secret : undefined; })(newKey()) : undefined);
if (kept === undefined) process.exit(half ? 3 : 1);
try { process.stdout.write(half ? publicOf(kept) : signLot(readFileSync(0, 'utf8'), kept, key, algorithm)); } catch { process.exit(1); }
