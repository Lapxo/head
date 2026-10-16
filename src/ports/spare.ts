import { readFileSync } from 'node:fs';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

/**
 * A process started before it is asked: it loads what the program it will run imports, says it is ready on its fourth
 * pipe, and waits there for one ask, the folder, the arguments and the variables a process started then would have been
 * given. It takes them as its own, closes that pipe and runs the program once, as that process would have. An ask that
 * never comes ends it.
 */
const [program] = process.argv.slice(2) as [string];
const url = pathToFileURL(program), pipe = new Socket({ fd: 3, readable: true, writable: true });
const asked = new Promise<string>((resolve) => { let text = ''; pipe.setEncoding('utf8').on('data', (chunk: string) => { text += chunk; }).on('error', () => undefined).on('close', () => resolve(text)); });
await Promise.all([...readFileSync(program, 'utf8').matchAll(/^import [^'"]*['"](\.{1,2}\/[^'"]+)['"];?$/gm)].map(([, path]) => import(new URL(path!, url).href).catch(() => undefined)));
pipe.write('ready\n');
const text = await asked;
if (!text) process.exit(0);
const { cwd, args, env } = JSON.parse(text) as { cwd: string; args: string[]; env: Record<string, string> };
for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
Object.assign(process.env, env);
process.chdir(cwd);
process.argv = [process.argv[0]!, program, ...args];
await import(url.href);
