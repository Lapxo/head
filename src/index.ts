#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { aboutOf, members, valueOf, type Said } from './core/lock.ts';
import { lockAt } from './ports/place.ts';
import { serve } from './ports/adapters/protocol.ts';

const [ext, root] = ((self) => [self.slice(self.lastIndexOf('.')), fileURLToPath(new URL(self.endsWith('.ts') ? '..' : '../..', self))] as const)(import.meta.url);
const lock = lockAt(root);
const [door, doors] = [process.argv[3], members(valueOf(lock, 'cli/run/doors'))];
if (process.argv[2] !== valueOf(lock, 'cli/run') || (door !== undefined && !doors.includes(door))) { process.stdout.write(`${aboutOf(lock, 'cli/help')}\n`); process.exit(0); }
if (door !== undefined && door !== doors[0]) { await ((await import(new URL(`./doors/${door}${ext}`, import.meta.url).href)) as { open: (lock: readonly Said[], root: string, ext: string, door: string) => Promise<void> }).open(lock, root, ext, door); process.exit(); }
await serve(lock, root, ext, doors[0]!);
