import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Printed } from '../src/ports/process.ts';
import { offline } from './worlds.ts';

/** bound's own command, run as a person runs it beside a test: what it printed, line by line, and its exit. */
export const run = (name: string, cwd: string, args: readonly string[], env: Readonly<Record<string, string>> = {}): Printed | undefined => {
  try {
    const manifest = createRequire(import.meta.url).resolve(join(name, 'package.json'));
    const bin = join(dirname(manifest), Object.values((JSON.parse(readFileSync(manifest, 'utf8')) as { bin: Record<string, string> }).bin)[0]!);
    const got = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...offline(), ...env } });
    const lines = (text: string | null): readonly string[] => (text ?? '').split('\n').filter(Boolean);
    return { code: got.status ?? -1, out: lines(got.stdout), err: [...lines(got.stderr), ...(got.error ? [got.error.message] : [])] };
  } catch { return undefined; }
};
