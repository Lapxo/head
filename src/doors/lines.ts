import { createInterface } from 'node:readline';
import type { Said } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { shapeOf } from '../ports/surface.ts';
import { plainOf } from './head.ts';

/** The lines door: one JSON request a line in, its answer one JSON line out, the cells as every door gives them. */
export const open = (lock: readonly Said[], root: string, ext: string, name: string): Promise<void> => new Promise((done) => {
  const [door, say] = [plainOf(lock, root, ext, name), sayIn(lock)];
  const answered = (id: unknown, answer: readonly string[] | undefined) => process.stdout.write(`${JSON.stringify({ id, ...shapeOf(answer ?? [say('door-unread', { verbs: door.verbs.join(', ') })]) })}\n`);
  let pending: Promise<unknown> = Promise.resolve();
  createInterface({ input: process.stdin }).on('line', (text) => { pending = pending.then(async () => {
    const asked = ((t) => { try { return JSON.parse(t) as { id?: unknown; verb?: string; args?: Record<string, unknown> }; } catch { return {}; } })(text);
    answered(asked.id, await door.asked(asked.verb ?? '', asked.args));
  }); }).on('close', () => void pending.then(door.settle).then(door.head.idle).then(() => done()));
});
