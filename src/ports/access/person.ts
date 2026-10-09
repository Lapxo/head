import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Choice, Field, Held } from '../../access/contract.ts';
import { aboutOf, members, valueOf } from '../../core/lock.ts';
import type { Said } from '../../core/lock.ts';
import { fill } from '../../core/surface.ts';
import { open } from './page.ts';

/** What the client lets head ask of the person: whether it sends addresses and asks forms, and the asking itself. */
export interface Client { readonly can: () => { readonly url: boolean; readonly form: boolean }; readonly elicit: (params: Readonly<Record<string, unknown>>) => Promise<{ readonly action: string; readonly content?: Readonly<Record<string, unknown>> }> }

/**
 * The person at this device, asked through the richest channel the client declares, in the order head's lock lines name:
 * the client's own form; head's one-time page, sent by the client as an address; the same page opened by this device's
 * browser. A secret goes only through the page — never a form the model could see — and a yes only through what the
 * client can ask, else it is the person's to sign. A visit to a provider comes back to such a page.
 */
export const personOf = (lock: readonly Said[], client: Client) => {
  const wait = Number(valueOf(lock, 'access/wait').split('..')[1]);
  const channel = (rule: string): string | undefined => ((can) => members(valueOf(lock, rule)).find((c) => (c === 'device' ? true : can[c as 'url' | 'form'])))(client.can());
  const offer = async (message: string, url: string, how: string | undefined): Promise<boolean> => (how === 'url' ? (await client.elicit({ mode: 'url', message, url, elicitationId: randomUUID() })).action === 'accept'
    : how === 'device' ? new Promise((resolve) => ((opener) => execFile(opener[0] ?? '', [...opener.slice(1), url], (error) => resolve(error === null)))(members(valueOf(lock, `platform/${process.platform}/browser`)))) : false);
  const offered = async (message: string, page: Awaited<ReturnType<typeof open>>, how: string | undefined, url = page.url) => ((await offer(message, url, how)) ? page.held : (page.close(), undefined));
  const paged = async (title: string, fields: readonly Field[], how: string | undefined) => offered(fill(aboutOf(lock, fields.some((f) => f.secret) ? 'said/enter' : 'said/answer'), { title }), await open(title, fields, wait), how);
  const form = async (message: string, properties: Readonly<Record<string, unknown>>) => ((got) => (got.action === 'accept' ? Object.fromEntries(Object.entries(got.content ?? {}).map(([k, v]) => [k, String(v)])) : undefined))(
    await client.elicit({ message, requestedSchema: { type: 'object', properties, required: Object.keys(properties) } }));
  return {
    consent: async (message: string, word: string): Promise<'yes' | 'no' | 'none'> => ((how) => (how === undefined ? Promise.resolve('none' as const)
      : (how === 'form' ? form(message, { yes: { type: 'boolean', title: word } }) : paged(message, [{ name: 'yes', label: word, secret: false, options: [{ value: 'true', label: word }, { value: 'false', label: 'No' }] }], how))
        .then((got) => (got?.['yes'] === 'true' ? 'yes' as const : 'no' as const))))(channel('ask/consent-channels')),
    enter: async (title: string, fields: readonly Field[]): Promise<Held | undefined> => paged(title, fields, channel('ask/secret-channels')),
    choose: async (message: string, choices: readonly Choice[]): Promise<Held | undefined> => ((how) => (how === 'form'
      ? form(message, Object.fromEntries(choices.map((c) => [c.name, { type: 'string', title: c.label ?? c.name, ...(c.options ? { oneOf: c.options.map((o) => ({ const: o.value, title: o.label })) } : {}) }])))
      : how === undefined ? Promise.resolve(undefined) : paged(message, choices.map((c) => ({ name: c.name, label: c.label ?? c.name, secret: false, ...(c.options ? { options: c.options } : {}) })), how)))(channel('ask/channels')),
    visit: async (message: string, to: (back: string) => string | undefined | Promise<string | undefined>): Promise<Held | undefined> => {
      const page = await open(message, 'return', wait);
      const url = await to(page.url);
      return url === undefined ? (page.close(), undefined) : offered(fill(aboutOf(lock, 'said/visit'), { message }), page, channel('ask/secret-channels'), url);
    },
  };
};
