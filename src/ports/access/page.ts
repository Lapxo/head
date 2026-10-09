import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Field, Held } from '../../access/contract.ts';

const escape = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const box = 'style="width:100%;font:inherit;padding:.4rem"', press = 'style="font:inherit;padding:.4rem 1rem;margin-right:.5rem"';
/** One field as the page asks it: a secret as a password, a choice as a list of its options — or, when it is the page's only question, as one button an option — anything else as text. */
const asked = (f: Field, alone: boolean): string => (f.options && alone ? `<p>${escape(f.label)}</p>${f.options.map((o) => `<button name="${escape(f.name)}" value="${escape(o.value)}" ${press}>${escape(o.label)}</button>`).join('')}`
  : `<label style="display:block;margin:1rem 0">${escape(f.label)}<br>${f.options ? `<select name="${escape(f.name)}" required ${box}>${f.options.map((o) => `<option value="${escape(o.value)}">${escape(o.label)}</option>`).join('')}</select>`
    : `<input name="${escape(f.name)}" type="${f.secret ? 'password' : 'text'}" autocomplete="off" required ${box}>`}</label>`);
const form = (title: string, fields: readonly Field[]): string => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title>
<body style="font:16px system-ui;max-width:28rem;margin:3rem auto;padding:0 1rem"><h1 style="font-size:1.2rem">${escape(title)}</h1><form method="post">${fields.map((f) => asked(f, fields.length === 1)).join('')}
${fields.length === 1 && fields[0]!.options ? '' : `<button ${press}>Send</button>`}</form></body>`;
const done = `<!doctype html><meta charset="utf-8"><title>done</title><body style="font:16px system-ui;margin:3rem">Received. You can close this page.</body>`;

/**
 * One page on this device, for one person, once: served on a loopback port under a path no one can guess, it takes the
 * fields it was opened with — a secret one as a password, never echoed, a choice among its options — or, as a return
 * address, what a visit sends back.
 * It answers the first submission and closes; a wait that runs out closes it with nothing.
 */
export const open = async (title: string, fields: readonly Field[] | 'return', wait: number): Promise<{ readonly url: string; readonly held: Promise<Held | undefined>; readonly close: () => void }> => {
  const nonce = randomBytes(24).toString('base64url');
  let settle: (held: Held | undefined) => void = () => undefined;
  const held = new Promise<Held | undefined>((resolve) => { settle = resolve; });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== `/${nonce}`) { response.writeHead(404).end(); return; }
    if (fields === 'return' && request.method === 'GET') { response.writeHead(200, { 'content-type': 'text/html' }).end(done); finish(Object.fromEntries(url.searchParams)); return; }
    if (fields !== 'return' && request.method === 'GET') { response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end(form(title, fields)); return; }
    let body = '';
    request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); if (body.length > 65536) request.destroy(); });
    request.on('end', () => { response.writeHead(200, { 'content-type': 'text/html' }).end(done); finish(Object.fromEntries(new URLSearchParams(body))); });
  });
  let closed = false;
  const finish = (got: Held | undefined) => { if (closed) return; closed = true; server.close(); settle(got); };
  const signal = AbortSignal.timeout(wait);
  signal.addEventListener('abort', () => finish(undefined), { once: true });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/${nonce}`, held, close: () => finish(undefined) };
};
