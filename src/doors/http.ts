import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { valueOf, type Said } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { shapeOf } from '../ports/surface.ts';
import { plainOf } from './head.ts';

/** The http door, on this device's loopback alone: one POST a verb, its body the args, its answer the cells every door gives; a Host not its own, or any Origin, is refused by name. It ends when its input does. */
export const open = (lock: readonly Said[], root: string, ext: string, name: string): Promise<void> => new Promise((done) => {
  const [loopback, asked, say] = [valueOf(lock, 'doors/loopback'), process.argv[4] ?? '0', sayIn(lock)];
  if (!/^\d+$/.test(asked)) { process.stdout.write(`${JSON.stringify(shapeOf([say('door-bind', { asked, loopback })]))}\n`); process.exitCode = 1; done(); return; }
  const door = plainOf(lock, root, ext, name);
  const server = createServer((request, out) => {
    const [own, answer] = [`${loopback}:${(server.address() as AddressInfo).port}`, (status: number, lines: readonly string[]) => out.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(shapeOf(lines)))];
    if (request.headers.origin !== undefined || request.headers.host !== own) return void answer(403, [say(request.headers.origin !== undefined ? 'door-origin' : 'door-host', { origin: request.headers.origin ?? '', host: request.headers.host ?? '', own })]);
    let body = '';
    request.on('data', (chunk) => { body += chunk; }).on('end', async () => {
      const args = ((t) => { try { return JSON.parse(t || '{}') as unknown; } catch { return undefined; } })(body);
      const lines = request.method === 'POST' && args !== null && typeof args === 'object' && !Array.isArray(args) ? await door.asked((request.url ?? '').slice(1), args as Record<string, unknown>) : undefined;
      answer(lines === undefined ? 400 : 200, lines ?? [say('door-unasked', { verbs: door.verbs.join(', ') })]);
    });
  });
  server.listen(Number(asked), loopback, () => process.stdout.write(`${JSON.stringify({ port: (server.address() as AddressInfo).port })}\n`));
  process.stdin.on('end', () => server.close(() => void door.settle().then(door.head.idle).then(() => done()))).resume();
});
