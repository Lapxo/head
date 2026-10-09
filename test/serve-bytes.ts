import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';

/** A separate process serving fixed files by path, so a host that blocks on a child still gets answered; it prints its origin, then each path it served. */
const files = JSON.parse(process.argv[2] ?? '{}') as Record<string, string>;
const server = createServer((request, response) => {
  const at = files[request.url ?? ''];
  process.stdout.write(`HIT ${request.url}\n`);
  if (at === undefined) { response.writeHead(404); response.end(); return; }
  response.writeHead(200); response.end(readFileSync(at));
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`AT http://127.0.0.1:${(server.address() as AddressInfo).port}\n`));
