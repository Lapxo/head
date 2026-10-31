import { test } from 'node:test';
import { strict as a } from 'node:assert';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { systemNode, relayToNode } from '../src/ports/executable.ts';

test('installed Node discovery: real executable, no relative PATH, missing/old/Electron candidates refuse without leaking output', () => {
  const root = mkdtempSync(join(tmpdir(), 'head-node-selection-'));
  try {
    const real = join(root, 'real'); mkdirSync(real); symlinkSync(process.execPath, join(real, 'node'));
    a.equal(systemNode([real]), process.execPath);
    a.throws(() => systemNode([]), /runtime\/node-required/);
    a.throws(() => systemNode(['.', 'relative']), /runtime\/node-required/);
    for (const [name, text] of [['old', '{"node":"20.0.0"}'], ['electron', '{"node":"24.0.0","electron":"1.0"}'], ['malformed', 'private-error-canary']]) {
      const dir = join(root, name); mkdirSync(dir); const at = join(dir, 'node'); writeFileSync(at, `#!/bin/sh\nprintf '%s' '${text}'\n`); chmodSync(at, 0o755);
      a.throws(() => systemNode([dir]), error => error instanceof Error && /runtime\/node-required/.test(error.message) && !error.message.includes('private-error-canary'));
      a.equal(systemNode([dir, real]), process.execPath);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('whole-entry relaunch preserves exit status and strips runtime injection variables', async () => {
  const root = mkdtempSync(join(tmpdir(), 'head-node-relay-')), before = process.env['NODE_OPTIONS'];
  try {
    const entry = join(root, 'child.mjs'); writeFileSync(entry, "if(process.env.NODE_OPTIONS || process.versions.electron) process.exit(2);process.exit(Number(process.argv[2]));\n");
    process.env['NODE_OPTIONS'] = '--require=/not/a/module';
    a.equal(await relayToNode(entry, ['7'], [dirname(process.execPath)]), 7);
  } finally { if (before === undefined) delete process.env['NODE_OPTIONS']; else process.env['NODE_OPTIONS'] = before; rmSync(root, { recursive: true, force: true }); }
});
