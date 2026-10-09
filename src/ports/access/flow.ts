import { createHash, randomBytes } from 'node:crypto';
import type { AccessAdapter, Fields, Want } from '../../access/contract.ts';

type Value = string | readonly string[] | undefined;
type Refusal = { readonly refused: string; readonly input?: string };
const one = (f: Fields | undefined, measure: string): string | undefined => f?.[measure]?.[0];
const pointed = (json: unknown, pointer: string): readonly string[] => pointer.split('/').slice(1).map((s) => s.replaceAll('~1', '/').replaceAll('~0', '~'))
  .reduce<readonly unknown[]>((at, step) => at.flatMap((v) => (v === null || typeof v !== 'object' ? [] : step === '*' ? Object.values(v as object) : [(v as Record<string, unknown>)[step]])), [json])
  .flatMap((v) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? [String(v)] : []));
const transforms: Readonly<Record<string, (s: string) => string>> = { s256: (s) => createHash('sha256').update(s).digest('base64url'), base64url: (s) => Buffer.from(s).toString('base64url'), base64: (s) => Buffer.from(s).toString('base64') };
const empty = (v: Value): boolean => v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const originOf = (url: string): string => (URL.canParse(url) ? new URL(url).origin : '');

/**
 * Access as its document declares it, one way for every kind: the steps its flow names, in order — an operation of a
 * source, an address its authorizer names, or a page the person is sent to and comes back from, opened first so every
 * step before it knows where the person comes back — each sent what its payload says, with the token so far when it
 * says so, keeping what its outputs point at — whatever its status, since an answer that calls for a next step may come
 * as an error; a step whose when holds nothing is passed over, one whose answer holds nothing its outputs name stops the
 * flow by its name, and so does one that answers an error and names nothing to keep. What the person is asked is asked the first time a step needs it, as the
 * flow says: a form, a one-time code, a choice among what an answer listed, or a secret on head's own page as far as the
 * place's root allows. What the person gives travels only to the source's origin or one its own document names. Only
 * the token is kept, and it rides a request as the flow's template says.
 */
export const adapter: AccessAdapter = {
  attach: (secret, params) => ((into, name, value) => (into === 'header' ? { headers: { [name]: value }, query: {} } : into === 'query' ? { headers: {}, query: { [name]: value } } : { headers: {}, query: {} }))(
    one(params, 'attach-in'), one(params, 'attach-name') ?? '', (one(params, 'attach-template') ?? '{token}').split('{token}').join(secret)),
  obtain: async (want: Want) => {
    const [d, gen, inputs, outputs] = [want.declared, { state: randomBytes(24).toString('base64url'), verifier: randomBytes(32).toString('base64url') }, new Map<string, string>(), new Map<string, ReadonlyMap<string, Value>>()];
    let [callback, secrets, refused] = ['', 0, undefined as Refusal | undefined];
    const stop = (why: Refusal): undefined => { refused ??= why; return undefined; };
    const ask = async (name: string): Promise<string | undefined> => {
      const [f, label] = [d[`inputs/${name}`], one(d[`inputs/${name}`], 'label') ?? name];
      const how = one(f, 'ask');
      const got = how === 'secret' ? (++secrets > want.secrets ? stop({ refused: 'secret-unallowed', input: name }) : (await want.enter(`${want.source} in ${want.place} · ${label}`, [{ name, label, secret: true }]))?.[name])
        : how === 'choice' ? await (async () => { const [values, labels] = [[(await resolve(one(f, 'from') ?? '')) ?? []].flat(), [(await resolve(one(f, 'label') ?? '')) ?? []].flat()];
          return (await want.choose(`Choose ${name} for ${want.source} in ${want.place}`, [{ name, options: values.map((value, i) => ({ value, label: labels[i] ?? value })) }]))?.[name]; })()
        : how === 'form' || how === 'one-time' ? (await want.choose(how === 'form' ? `${want.source} in ${want.place} asks for ${label}` : `${want.source} in ${want.place} sent you a one-time code: enter it within ${one(f, 'ttl') ?? '?'} seconds`, [{ name, label }]))?.[name]
        : stop({ refused: 'carry-unsettled', input: name });
      if (got !== undefined) inputs.set(name, got);
      return got ?? stop({ refused: 'entry-unfinished', input: name });
    };
    const resolve = async (expr: string, response?: unknown): Promise<Value> => {
      const [fn, head] = [/^(\w+)\((.*)\)$/.exec(expr), expr.split(/[.#(]/)[0]!];
      if (fn !== null) return want.values.includes(fn[1]!) && transforms[fn[1]!] ? transforms[fn[1]!]!(String(await resolve(fn[2]!, response) ?? '')) : stop({ refused: 'carry-unsettled', input: fn[1] });
      if (/\{[^}]+\}/.test(expr)) { let out = expr; for (const [m, ref] of expr.matchAll(/\{([^}]+)\}/g)) out = out.replace(m, String((await resolve(ref!, response)) ?? '')); return out; }
      if (/^'.*'$/.test(expr)) return expr.slice(1, -1);
      if (!expr.startsWith('$')) return expr;
      if (!want.values.includes(head)) return stop({ refused: 'carry-unsettled', input: head });
      const [, a = '', , b = ''] = expr.split('.');
      return head === '$callback' ? callback : head === '$state' ? gen.state : head === '$verifier' ? gen.verifier : head === '$scopes' ? want.scopes.join(' ')
        : head === '$client' ? one(d[''], 'client') ?? stop({ refused: 'no-client' }) : head === '$host' ? want.host[a] ?? stop({ refused: 'host-input', input: a }) : head === '$inputs' ? inputs.get(a) ?? (await ask(a)) : head === '$steps' ? outputs.get(a)?.get(b)
        : ((all) => (expr.includes('*') ? all : all[0]))(pointed(response, expr.slice(expr.indexOf('#') + 1)));
    };
    const gather = async (k: string, kind: 'payload' | 'outputs', response?: unknown): Promise<Readonly<Record<string, Value>>> => {
      const held: Record<string, Value> = {};
      for (const key of Object.keys(d).filter((one_) => one_.startsWith(`${k}/${kind}/`))) held[key.slice(k.length + kind.length + 2)] = d[key]!['items'] ? (await Promise.all(d[key]!['items']!.map((e) => resolve(e, response)))).flatMap((v) => (v === undefined ? [] : [v].flat())) : await resolve(one(d[key], 'value') ?? '', response);
      return held;
    };
    const kept = async (k: string, response: unknown, status = 200): Promise<boolean> => {
      const held = await gather(k, 'outputs', response);
      if (Object.values(held).every(empty) && (status >= 400 || Object.keys(held).length)) return Boolean(stop({ refused: 'step-unanswered', input: one(d[k], 'id') ?? k }));
      outputs.set(one(d[k], 'id') ?? k, new Map(Object.entries(held)));
      return true;
    };
    const guarded = (k: string): boolean => ((at) => !(at !== undefined && d[k]!['overlay'] && originOf(at) !== originOf(want.origin)
      && Object.keys(d).some((key) => key.startsWith(`${k}/payload/`) && (d[key]!['value'] ?? d[key]!['items'] ?? []).some((e) => e.includes('$inputs.')))) || Boolean(stop({ refused: 'cross-origin' })))(one(d[k], 'url') ?? one(d[k], 'page'));
    const run = async (k: string): Promise<boolean> => {
      const f = d[k]!;
      if (one(f, 'when') !== undefined && empty(await resolve(one(f, 'when')!))) return true;
      if (!guarded(k)) return false;
      const [sent, token] = [await gather(k, 'payload'), one(f, 'token') === undefined ? undefined : await resolve(one(f, 'token')!)];
      if (refused) return false;
      const answered = one(f, 'operation') !== undefined ? await want.call(one(f, 'source') ?? want.source, one(f, 'operation')!, sent, typeof token === 'string' ? adapter.attach(token, d[''] ?? {}) : undefined)
        : await want.post(one(f, 'url')!, sent, one(f, 'encoding') === 'json' ? 'json' : 'form');
      return refused ? false : answered === undefined ? Boolean(stop({ refused: 'login-refused' })) : kept(k, answered.json, answered.status);
    };
    const steps = Object.keys(d).filter((key) => /^steps\/\d+$/.test(key)).sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
    const page = steps.findIndex((k) => one(d[k], 'page') !== undefined);
    if (page >= 0) {
      const back = await want.visit(`Sign in to ${want.source} at its provider`, async (address) => {
        callback = address;
        for (const k of steps.slice(0, page)) if (!(await run(k))) return undefined;
        if (!guarded(steps[page]!)) return undefined;
        const to = new URL(one(d[steps[page]!], 'page')!);
        for (const [name, v] of Object.entries(await gather(steps[page]!, 'payload'))) if (!empty(v)) to.searchParams.set(name, String(v));
        return refused ? undefined : to.href;
      });
      if (!refused && (back === undefined || (back['state'] !== undefined && back['state'] !== gen.state))) stop({ refused: 'login-refused' });
      if (!refused) await kept(steps[page]!, back);
    }
    for (const k of page >= 0 ? steps.slice(page + 1) : steps) if (refused || !(await run(k))) break;
    const [token, expires] = [(await Promise.all((d['']?.['token'] ?? []).map((e) => resolve(e)))).find((v) => !empty(v)), (await Promise.all((d['']?.['expires'] ?? []).map((e) => resolve(e)))).find((v) => !empty(v))];
    if (refused) return refused;
    if (typeof token !== 'string' || !token) return { refused: 'login-refused' };
    return { secret: token, ...(typeof expires === 'string' && Number.isFinite(Number(expires)) ? { expires: want.now + Number(expires) * 1000 } : {}), ...(steps.length ? {} : { manual: true as const }) };
  },
};
