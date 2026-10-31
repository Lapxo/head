import { createHash } from 'node:crypto';
import { canonical } from '@lapxo/topos/wire';
import { jsonOf } from './contract.ts';
import type { Attachment, Obtained, Want } from './contract.ts';
import { placeNameOf } from '../core/answer.ts';
import type { Context } from '../core/answer.ts';
import { members, valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import { fieldsOf, stepOf, vocabOf } from '../core/read.ts';
import type { Call } from '../core/read.ts';

type Kept = Obtained & { readonly at?: string; readonly binding?: string; readonly state?: string };
/** A storage namespace is not authority: the root public key comes from Bound's authenticated standing. */
export const accessIdentity = (context: Context, plan: Call, lines: readonly Said[]) => {
  const root = lines.find(l => l.scope === valueOf(context.lock, 'founding/root') && l.measure === 'public-key')?.value;
  if (!root || !plan.access.account || !URL.canParse(plan.origin)) return undefined;
  const outcome = `${valueOf(context.lock, 'access/family')}/${plan.access.flow}/`, receiptAt = valueOf(context.lock, 'receipt/at') + ':';
  const isOutcome = (l: Said) => ['obtained', 'renewed', 'entered'].some(event => l.scope === outcome + event) && l.measure === 'status' && l.value === 'present' && l.at?.startsWith(receiptAt) && l.about?.startsWith('access-binding:sha256:');
  const scheme = plan.access.from ?? `${vocabOf(context.lock).keys}/${plan.access.flow}`, declarations = lines.filter(l => (l.scope === scheme || l.scope?.startsWith(scheme + '/')) && !isOutcome(l)).map(({sig,epoch,at,by,...line}) => canonical(line)).sort();
  const binding = createHash('sha256').update(JSON.stringify([root, new URL(plan.origin).href, plan.access.kind, plan.access.scheme, plan.access.flow, declarations, Object.entries(plan.access.params).sort(([a], [b]) => a.localeCompare(b))])).digest('hex');
  return { binding, account: `${plan.access.account}/${binding}` };
};
export const sealed = (got: Kept): string => Buffer.from(JSON.stringify(got)).toString('base64url');
export const opened = (kept: string | undefined): Kept | undefined => { try { return kept === undefined ? undefined : JSON.parse(Buffer.from(kept, 'base64url').toString('utf8')) as Kept; } catch { return undefined; } };
const holds = (held: Kept | undefined, now: number): held is Kept => held !== undefined && (held.expires === undefined || held.expires > now);
const recorded = (context: Context, plan: Call, lines: readonly Said[], held: Kept | undefined) => !!held?.at && lines.some(l => l.scope?.startsWith(`${valueOf(context.lock, 'access/family')}/${plan.access.flow}/`) && l.at === `${valueOf(context.lock, 'receipt/at')}:${held.at}` && l.value === 'present' && l.about === `access-binding:sha256:${held.binding}`);
const asOf = (account: string, held: Kept): string | undefined => (held.at === undefined ? undefined : `${account}@${held.at}`);

/** Whom a call is made as, never its secret: anonymous, or the access account and when the secret it holds now was obtained — still holding, unless what was made as it is only being looked back on; none while no secret is kept, or one is kept without saying when. */
export const principalOf = (context: Context, plan: Call, current = true, lines: readonly Said[] = []): string | undefined => {
  if (plan.access.account === undefined) return 'anonymous';
  const identity = accessIdentity(context, plan, lines), held = identity && opened(context.keys.read(identity.account));
  return identity && held?.binding === identity.binding && held.state === 'ready' && recorded(context, plan, lines, held) && (!current || holds(held, context.now())) ? asOf(identity.account, held) : undefined;
};

/**
 * What a call's access attaches: nothing when it is anonymous; the kept secret while it holds; else the flow its kind's
 * adapter runs — found by the line, never by a name head knows — its secret kept in the place's keychain entry and its
 * obtaining landed as a receipt without the secret. What a person enters goes only to the origin of the source in use:
 * a step of another source is sent there too, where that source declares it among its own, and refused by name where not. A kind no adapter carries, or a flow that does not finish, is no call.
 */
export const attachmentFor = async (context: Context, place: string, lines: readonly Said[], plan: Call, retry = false): Promise<{ readonly attachment: Attachment | undefined; readonly principal: string | undefined } | { readonly said: string; readonly input?: string }> => {
  const access = plan.access;
  if (access.account === undefined) return { attachment: undefined, principal: 'anonymous' };
  const adapter = await context.access(access.kind);
  if (adapter === undefined) return { said: 'no-adapter' };
  const identity = accessIdentity(context, plan, lines);
  if (!identity) return { said: 'access-context-unverified' };
  const held = opened(context.keys.read(identity.account)), pendingAccount = identity.account + '/attempt', pending = opened(context.keys.read(pendingAccount));

  if (held?.binding === identity.binding && held.state === 'ready' && recorded(context, plan, lines, held) && holds(held, context.now())) return { attachment: adapter.attach(held.secret, access.params), principal: asOf(identity.account, held) };
  if (held && (held.binding !== identity.binding || held.state !== 'ready')) return { said: 'access-binding' };
  if (pending?.state === 'pending' || (held && !recorded(context, plan, lines, held))) {
    if (!retry) return { said: 'access-attempt-pending' };
    if (await context.elicit('A prior access attempt may have completed externally. Retry the declared access flow?') !== 'yes') return { said: 'no-yes' };
  }
  try { context.keys.write(pendingAccount, sealed({ secret: '', state: 'pending', binding: identity.binding, at: new Date(context.now()).toISOString() })); }
  catch { return { said: 'access-store-refused' }; }
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
  const [scheme, root] = [access.from ?? `${v.keys}/${access.flow}`, valueOf(context.lock, 'founding/root').split('/')[1]];
  const want: Want = {
    place: placeNameOf(place), source: plan.source, scheme: access.scheme, params: access.params, now: context.now(), origin: plan.origin, renew: (held as Kept | undefined)?.renew,
    declared: Object.fromEntries([...new Set(lines.filter((l) => l.scope === scheme || l.scope?.startsWith(`${scheme}/`)).map((l) => l.scope!))].map((at) => [at.slice(scheme.length + 1), fieldsOf(lines, at)])),
    secrets: Number((lines.find((l) => l.scope === valueOf(context.lock, 'access/secrets') && l.by === root)?.value ?? '0..0').split('..')[1]),
    values: members(valueOf(lines, 'wire/access-values') || valueOf(context.lock, 'wire/access-values')),
    host: Object.fromEntries(context.lock.filter((l) => l.scope?.startsWith('host/')).map((l) => [l.scope!.slice('host/'.length), l.value ?? ''])),
    scopes: [...new Set(lines.filter((l) => reads.has(l.scope) && l.measure === 'scopes').flatMap((l) => (l.value ?? '').split('|')))].sort(),
    enter: (title, fields) => context.person.enter(title, fields), choose: (message, choices) => context.person.choose(message, choices), visit: (message, to) => context.person.visit(message, to),
    call: step,
    post: async (url, body, as) => ((transport) => (transport === undefined ? undefined : transport.post(url, body, most, Number(valueOf(context.lock, 'adapter/request/wait').split('..')[1]), as)))(await context.adapter(url)),
  };
  const got = await adapter.obtain(want);
  if ('refused' in got) return { said: crossed ? 'cross-origin' : got.refused, ...(got.input === undefined ? {} : { input: got.input }) };
  const when = new Date(context.now()).toISOString();
  const receipt = canonical({ about: `access-binding:sha256:${identity.binding}`, at: `${valueOf(context.lock, 'receipt/at')}:${when}`, by: 'target', form: 'alphabet', measure: 'status', role: 'writes', scope: `${valueOf(context.lock, 'access/family')}/${access.flow}/${got.manual ? 'entered' : held === undefined ? 'obtained' : 'renewed'}`, value: 'present' });
  try { const landed = await context.landAs(place, [receipt], 'head', lines); if ('refused' in landed) return { said: 'access-receipt-refused' }; }
  catch { return { said: 'access-receipt-refused' }; }
  try { context.keys.write(identity.account, sealed({ ...got, at: when, binding: identity.binding, state: 'ready' })); context.keys.write(pendingAccount, sealed({ secret: '', state: 'cleared', binding: identity.binding })); }
  catch { return { said: 'access-store-refused' }; }
  return { attachment: adapter.attach(got.secret, access.params), principal: `${identity.account}@${when}` };
};
