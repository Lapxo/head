import { spawn } from 'node:child_process';
import { offline } from './worlds.ts';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { members, valueOf } from '../src/core/lock.ts';
import { lockAt } from '../src/ports/place.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const [word, standing] = ((lock) => [(scope: string) => members(valueOf(lock, scope)), valueOf(lock, 'bound/standing')] as const)(lockAt(root));
type Call = { method: string; params?: any };
/** A look's arguments as ask takes them: no resolution, which is the lock's; the region looked at past 0, or an operation not read, is asked why; no source is the lines that stand. */
const asking = ({ at, ...args }: Record<string, unknown>): Record<string, unknown> => (args['source'] === undefined ? { ...args, view: args['view'] || standing }
  : at === '1' || (args['operation'] !== undefined && at !== '8' && !args['why'] && !args['history']) ? { ...args, why: 'true' } : args);
/**
 * A call by a catalogue tool's name, as the three verbs carry it out: a question of ask's is asked; an action of do's is
 * done on the card the last answer about its place ended with, or, with none held, on the one ask answers for it just
 * before, asked apart and never returned.
 */
const carried = (call: Call): { readonly card?: Call; readonly call: Call } => ((name: string, args: Record<string, unknown>) => (call.method !== 'tools/call' ? { call }
  : word('ask/questions').includes(name) ? { call: { ...call, params: { name: 'ask', arguments: name === 'look' ? asking(args) : name === 'card' ? { card: 'true', ...args } : args } } }
  : word('do/actions').includes(name) ? { card: { method: 'tools/call', params: { name: 'ask', arguments: { card: 'true', ...((args['place'] ?? args['dir']) ? { place: args['place'] ?? args['dir'] } : {}) } } }, call: { ...call, params: { name: 'do', arguments: { action: name, ...args } } } }
  : { call }))(call.params?.name, call.params?.arguments ?? {});

/** A client over stdio: one JSON-RPC message a line, each call sent once the one before it is answered, and its session ended by closing head's input where coverage is kept, so head writes it. It answers roots/list with the roots it shares, elicitation/create as the test decides — declaring the modes it is given, form and url unless told — and collects answers by id. */
export const ask = async (calls: readonly { method: string; params?: unknown }[], roots: readonly string[] = [], env: Readonly<Record<string, string>> = {}, elicit?: (params: any) => unknown, modes: Readonly<Record<string, object>> = { form: {}, url: {} }): Promise<readonly any[]> => {
  const child = spawn(process.execPath, [process.env['HEAD_ENTRY'] || join(root, 'src/index.ts')], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ...offline(), ...env } });
  const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const waiting = new Map<number, (message: any) => void>();
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
      const message = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1);
      if (message.method === 'elicitation/create') void Promise.resolve(elicit?.(message.params)).then((result) => send({ jsonrpc: '2.0', id: message.id, result: result ?? { action: 'decline' } }));
      else if (message.method === 'roots/list') send({ jsonrpc: '2.0', id: message.id, result: { roots: roots.map((r) => ({ uri: pathToFileURL(r).href })) } });
      else if (message.id !== undefined) waiting.get(message.id)?.(message);
    }
  });
  const answered = (id: number, call: Call): Promise<any> => new Promise((resolve) => { waiting.set(id, resolve); send({ jsonrpc: '2.0', id, ...call }); });
  await answered(0, { method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: { ...(roots.length ? { roots: {} } : {}), ...(elicit ? { elicitation: modes } : {}) }, clientInfo: { name: 'test', version: '0' } } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const got: any[] = [], cards = new Map<string, string>();
  const kept = (answer: any) => { for (const c of answer?.result?.structuredContent?.cells ?? []) if (c.code === 'head/card') cards.set(c.fields.place, c.fields.card); return answer; };
  for (const [i, one] of calls.entries()) {
    const { card, call } = carried(one), place = card?.params.arguments.place as string | undefined;
    if (call.params?.name === 'connect') cards.clear();
    const held = card && ((place && cards.get(place)) ?? kept(await answered(-(i + 1), card)).result?.structuredContent?.cells?.find((c: any) => c.code === 'head/card')?.fields?.card);
    got.push(kept(await answered(i + 1, card ? { ...call, params: { ...call.params, arguments: { ...call.params.arguments, card: held ?? '' } } } : call)));
  }
  if (process.env['NODE_V8_COVERAGE']) { child.stdin.end(); await new Promise<void>((resolve) => { const late = setTimeout(() => { child.kill(); resolve(); }, 5000); child.on('exit', () => { clearTimeout(late); resolve(); }); }); } else child.kill();
  return got;
};

