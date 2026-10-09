#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { signLot } from './core/keys.ts';
import { keychain } from './ports/keychain.ts';

const [service = '', account = '', key = '', algorithm = '', store = 'keychain'] = process.argv.slice(2);
const secret = keychain(service, store).read(account);
if (secret === undefined) process.exit(1);
try { process.stdout.write(signLot(readFileSync(0, 'utf8'), secret, key, algorithm)); } catch { process.exit(1); }
