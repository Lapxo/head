import { canonical } from '@lapxo/topos/wire';
import { jsonOf } from './contract.ts';
import type { Attachment, Obtained, Want } from './contract.ts';
import { placeNameOf } from '../core/answer.ts';
import type { Context } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import { fieldsOf, stepOf, vocabOf } from '../core/read.ts';
import type { Call } from '../core/read.ts';

type Kept = Obtained & { readonly at?: string };
const sealed = (got: Kept): string => Buffer.from(JSON.stringify(got)).toString('base64url');
const opened = (kept: string | undefined): Kept | undefined => { try { return kept === undefined ? undefined : JSON.parse(Buffer.from(kept, 'base64url').toString('utf8')) as Kept; } catch { return undefined; } };
const holds = (held: Kept | undefined, now: number): held is Kept => held !== undefined && (held.expires === undefined || held.expires > now);
const asOf = (account: string, held: Kept): string | undefined => (held.at === undefined ? undefined : `${account}@${held.at}`);

/** Whom a call is made as, never its secret: anonymous, or the access account and when the secret it holds now was obtained — still holding, unless what was made as it is only being looked back on; none while no secret is kept, or one is kept without saying when. */
export const principalOf = (context: Context, plan: Call, current = true): string | undefined => ((account) => (account === undefined ? 'anonymous'
  : ((held) => (held !== undefined && (!current || holds(held, context.now())) ? asOf(account, held) : undefined))(opened(context.keys.read(account)))))(plan.access.account);

/**
 * What a call's access attaches: nothing when it is anonymous; the kept secret while it holds; else the flow its kind's
 * adapter runs — found by the line, never by a name head knows — its secret kept in the place's keychain entry and its
 * obtaining landed as a receipt without the secret. What a person enters goes only to the origin of the source in use:
 * a step of another source is sent there too, where that source declares it among its own, and refused by name where not. A kind no adapter carries, or a flow that does not finish, is no call.
 */
export const attachmentFor = async (context: Context, place: string, lines: readonly Said[], plan: Call): Promise<{ readonly attachment: Attachment | undefined; readonly principal: string | undefined } | { readonly said: string; readonly input?: string }> => {
  const access = plan.access;
  if (access.account === undefined) return { attachment: undefined, principal: 'anonymous' };
  const adapter = await context.access(access.kind);
  if (adapter === undefined) return { said: 'no-adapter' };
  const held = opened(context.keys.read(access.account));
  if (holds(held, context.now())) return { attachment: adapter.attach(held.secret, access.params), principal: asOf(access.account, held) };
  const [v, most] = [vocabOf(context.lock), Number((lines.find((l) => l.scope === 'read/response-bytes')?.value ?? '0..0').split('..')[1])];
  const origin = (url: string) => (URL.canParse(url) ? new URL(url).origin : ''); let crossed = false;
  const step = async (source: string, operation: string, body: unknown, attachment?: Attachment) => {
    const declares = (fieldsOf(lines, `${v.region}/${source}`)[v.origins] ?? []).includes(plan.origin);
    const call = stepOf(declares ? [...lines.filter((l) => l.scope !== `${v.pick}/${source}`), { scope: `${v.pick}/${source}`, value: plan.origin }] : lines, context.lock, source, operation);
    if (call.kind !== 'call' || origin(call.origin) !== origin(plan.origin)) { crossed = call.kind === 'call' || !declares; return undefined; }
    const transport = call.kind === 'call' ? await context.adapter(call.origin) : undefined;
    const prepared = call.kind === 'call' && transport ? transport.prepare(call, { body }, context.lock) : undefined;
    const got = prepared && 'send' in prepared ? await prepared.send(attachment, most) : undefined;
    return got?.kind === 'got' ? { status: got.status, json: jsonOf(got.bytes) } : undefined;
  };
  const reads = new Set(lines.filter((l) => l.scope?.startsWith(`${v.offers}/${plan.source}/`) && l.measure === v.class && l.value === v.callable).map((l) => l.scope));
  const [scheme, root] = [`${v.keys}/${access.flow}`, valueOf(context.lock, 'founding/root').split('/')[1]];
  const want: Want = {
    place: placeNameOf(place), source: plan.source, scheme: access.scheme, params: access.params, now: context.now(), origin: plan.origin,
    declared: Object.fromEntries([...new Set(lines.filter((l) => l.scope === scheme || l.scope?.startsWith(`${scheme}/`)).map((l) => l.scope!))].map((at) => [at.slice(scheme.length + 1), fieldsOf(lines, at)])),
    secrets: Number((lines.find((l) => l.scope === valueOf(context.lock, 'access/secrets') && l.by === root)?.value ?? '0..0').split('..')[1]),
    values: members(valueOf(lines, 'wire/access-values') || valueOf(context.lock, 'wire/access-values')),
    host: Object.fromEntries(context.lock.filter((l) => l.scope?.startsWith('host/')).map((l) => [l.scope!.slice('host/'.length), l.value ?? ''])),
    scopes: [...new Set(lines.filter((l) => reads.has(l.scope) && l.measure === 'scopes').flatMap((l) => (l.value ?? '').split('|')))].sort(),
    enter: (title, fields) => context.person.enter(title, fields), consent: async (message) => (await context.person.consent(message, valueOf(context.lock, 'said/elicit/yes'))) === 'yes', choose: (message, choices) => context.person.choose(message, choices), visit: (message, to) => context.person.visit(message, to),
    form: (source, operation) => fieldsOf(lines, `${v.offers}/${source}/${operation}/${v.form}`), call: step,
    post: async (url, body, as) => ((transport) => (transport === undefined ? undefined : transport.post(url, body, most, Number(valueOf(context.lock, 'adapter/request/wait').split('..')[1]), as)))(await context.adapter(url)),
  };
  const got = await adapter.obtain(want);
  if ('refused' in got) return { said: crossed ? 'cross-origin' : got.refused, ...(got.input === undefined ? {} : { input: got.input }) };
  const when = new Date(context.now()).toISOString();
  context.keys.write(access.account, sealed({ ...got, at: when }));
  const receipt = canonical({ at: `${valueOf(context.lock, 'receipt/at')}:${when}`, by: 'target', form: 'alphabet', measure: 'status', role: 'writes', scope: `${valueOf(context.lock, 'access/family')}/${access.flow}/${got.manual ? 'entered' : held === undefined ? 'obtained' : 'renewed'}`, value: 'present' });
  await context.landAs(place, [receipt], 'head', lines);
  return { attachment: adapter.attach(got.secret, access.params), principal: `${access.account}@${when}` };
};
