import { spawn } from 'node:child_process';
import { offline } from './worlds.ts';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** A client over stdio: one JSON-RPC message a line. It answers roots/list with the roots it shares, elicitation/create as the test decides — declaring the modes it is given, form and url unless told — and collects answers by id. */
export const ask = async (calls: readonly { method: string; params?: unknown }[], roots: readonly string[] = [], env: Readonly<Record<string, string>> = {}, elicit?: (params: any) => unknown, modes: Readonly<Record<string, object>> = { form: {}, url: {} }): Promise<readonly any[]> => {
  const child = spawn(process.execPath, [join(root, 'src/index.ts')], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ...offline(), ...env } });
  const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const got: any[] = [];
  let buffer = '';
  const done = new Promise<void>((resolve) => child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
      const message = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1);
      if (message.method === 'elicitation/create') void Promise.resolve(elicit?.(message.params)).then((result) => send({ jsonrpc: '2.0', id: message.id, result: result ?? { action: 'decline' } }));
      else if (message.method === 'roots/list') send({ jsonrpc: '2.0', id: message.id, result: { roots: roots.map((r) => ({ uri: pathToFileURL(r).href })) } });
      else if (message.id !== undefined) got.push(message);
    }
    if (got.length === calls.length + 1) resolve();
  }));
  send({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: { ...(roots.length ? { roots: {} } : {}), ...(elicit ? { elicitation: modes } : {}) }, clientInfo: { name: 'test', version: '0' } } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  calls.forEach((call, i) => send({ jsonrpc: '2.0', id: i + 1, ...call }));
  await done;
  child.kill();
  return got.sort((a, b) => a.id - b.id).slice(1);
};

