import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const made = new Set<string>();
/** A file one bound run reads, in a folder of its own under this device's temporary folder, kept only until that run ends. */
export const scratchOf = (prefix: string, name: string, text: string): string => ((dir) => { made.add(dir); writeFileSync(join(dir, name), text); return join(dir, name); })(mkdtempSync(join(tmpdir(), prefix)));
/** The folders made for what a run read, removed once it ended, however it ended; any other path is left as it is. */
export const cleared = (paths: readonly string[]): void => { for (const at of paths) if (made.delete(dirname(at))) rmSync(dirname(at), { recursive: true, force: true }); };
