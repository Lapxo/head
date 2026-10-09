import { alphabet } from '@lapxo/topos/wire';
import { valueOf } from './lock.ts';
import type { Said } from './lock.ts';

export type Plan = { readonly kind: 'said'; readonly key: string; readonly fields: Readonly<Record<string, string>> };
export type Fields = Readonly<Record<string, readonly string[]>>;
export interface Access { readonly kind: string; readonly scheme: string; readonly params: Fields; readonly account: string | undefined; readonly flow: string }
export interface Call { readonly kind: 'call'; readonly source: string; readonly operation: string; readonly origin: string; readonly carry: Fields; readonly form: Fields; readonly classes: readonly string[]; readonly access: Access }

const said = (key: string, fields: Readonly<Record<string, string>> = {}): Plan => ({ kind: 'said', key, fields });
const membersOf = (line: Said | undefined): readonly string[] | undefined => (line === undefined ? undefined : alphabet(line.value ?? '').members);
export const fieldsOf = (lines: readonly Said[], scope: string): Fields => Object.fromEntries(lines.filter((l) => l.scope === scope && l.measure).map((l) => [l.measure!, membersOf(l) ?? []]));

export const vocabOf = (lock: readonly Said[]) => ((w: (k: string) => string) => ({
  offers: w('offers'), keys: w('keys'), region: w('region'), class: w('class'), access: w('access'), origin: w('origin'), origins: w('origins'), issuers: w('issuers'), unresolved: w('unresolved'), unparsed: w('unparsed'), unsupported: w('unsupported'), collision: w('collision'),
  scheme: w('scheme'), form: w('form'), carry: w('carry'), anonymous: w('anonymous'), unstated: w('unstated'), callable: w('callable'), split: w('split'), pick: w('pick'),
}))((k) => valueOf(lock, `vocab/${k}`));
export type Vocab = ReturnType<typeof vocabOf>;

/** Where a source is reached: the origin the person picked, or the one its document declares when it declares one; several and none picked is no call, and none is ever a default. */
const originOf = (lines: readonly Said[], v: Vocab, source: string): string | Plan => {
  const at = fieldsOf(lines, `${v.region}/${source}`);
  const picked = lines.find((l) => l.scope === `${v.pick}/${source}`)?.value;
  if (picked !== undefined) return picked;
  const declared = at[v.origins] ?? [];
  return declared.length === 1 ? declared[0]! : said(declared.length ? 'pick-origin' : 'no-origin', { source, origins: declared.join(', ') });
};

/** How access is proven for an offer: its first declared alternative that says how what it obtains rides a request — anonymous, or a scheme whose flow the one adapter runs, its own or its issuer's, kept once per issuer; unstated, or none that says, is no call, named. */
const accessOf = (lines: readonly Said[], lock: readonly Said[], v: Vocab, source: string, operation: string, place: string): Access | Plan => {
  const ways = fieldsOf(lines, `${v.offers}/${source}/${operation}`)[v.access] ?? [v.unstated];
  if (ways.includes(v.unstated)) return said('access-unstated', { source, operation });
  const kindOf = (way: string) => {
    if (way === v.anonymous) return [way, v.anonymous, {} as Fields, '', undefined] as const;
    const issuer = fieldsOf(lines, `${v.keys}/${source}/${way}`)['issuer']?.[0];
    const flow = issuer ?? `${source}/${way}`;
    const params = fieldsOf(lines, `${v.keys}/${flow}`);
    return [way, params[v.scheme] ? valueOf(lock, 'access/adapter') : '', params, flow, issuer] as const;
  };
  const kinds = ways.map(kindOf);
  const usable = kinds.find(([, kind]) => kind !== '');
  if (usable === undefined) return said('no-adapter', { source, operation, kinds: ways.join(', ') });
  const [scheme, kind, params, flow, issuer] = usable;
  return { kind, scheme, params, flow, account: kind === v.anonymous ? undefined : valueOf(lock, issuer ? 'access/issuer-account' : 'access/account').split('{place}').join(place).split('{source}').join(source).split('{issuer}').join(issuer ?? '') };
};

export const stepOf = (lines: readonly Said[], lock: readonly Said[], source: string, operation: string): Call | Plan => {
  const v = vocabOf(lock);
  const offer = `${v.offers}/${source}/${operation}`;
  const classes = fieldsOf(lines, offer)[v.class];
  if (classes === undefined) return said('unknown-operation', { source, operation });
  const origin = originOf(lines, v, source);
  return typeof origin !== 'string' ? origin : { kind: 'call', source, operation, origin, carry: fieldsOf(lines, `${offer}/${v.carry}`), form: fieldsOf(lines, `${offer}/${v.form}`), classes, access: { kind: v.anonymous, scheme: '', params: {}, account: undefined, flow: '' } };
};

/** The call an offer would make, from the place's lines alone, with the access it is proven by; or why there is none. An offer read two ways is never called. */
const callOf = (lines: readonly Said[], lock: readonly Said[], source: string, operation: string, place: string): Call | Plan => {
  const step = stepOf(lines, lock, source, operation);
  if (step.kind === 'said') return step;
  if (step.classes.includes(vocabOf(lock).split)) return said('split-offer', { source, operation });
  const access = accessOf(lines, lock, vocabOf(lock), source, operation, place);
  return 'key' in access ? access : { ...step, access };
};

const isCallable = (lock: readonly Said[], classes: readonly string[]): boolean => classes.length === 1 && classes[0] === vocabOf(lock).callable;

export const planRead = (lines: readonly Said[], lock: readonly Said[], source: string, operation: string, place: string): Call | Plan => ((call) => (call.kind === 'call' && !isCallable(lock, call.classes) ? said('not-callable', { source, operation, class: call.classes.join(', ') }) : call))(callOf(lines, lock, source, operation, place));

export const planAct = (lines: readonly Said[], lock: readonly Said[], source: string, operation: string, place: string): Call | Plan => ((call) => (call.kind === 'call' && isCallable(lock, call.classes) ? said('is-read', { source, operation }) : call))(callOf(lines, lock, source, operation, place));
