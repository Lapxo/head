import { basename, join } from 'node:path';
import { answerOf, placeOf } from '../core/answer.ts';
import type { Asked, Context, Outcome } from '../core/answer.ts';
import { LOCK, parse } from '@lapxo/topos/wire';
import { aboutOf, members, valueOf, type Said } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { matchTemplate, refusedOn, shapeOf, surfaceOf } from '../ports/surface.ts';
import { birth, closing, founded, land, landAct, limits, pinnedAt, policyAt, run, settledView, sign, standingAt, told, words } from '../ports/bound.ts';
import { configureHost, authorityAt } from '../ports/host.ts';
import { held, keep } from '../ports/cache.ts';
import { dropAt, hasAt, layAt, listAt, takeAt } from '../ports/place.ts';
import * as documents from '../ports/documents.ts';
import { keychain, portOf } from '../ports/keychain.ts';
import { deviceOf, idIn, signingOf } from '../core/device.ts';
import { personOf, type Client } from '../ports/access/person.ts';
import { readAhead } from '../ahead/read.ts';
import { cardAt } from '../verbs/card.ts';
import { digestOf, guardOf, refusalsOf } from './guard.ts';

export interface Door extends Client { readonly roots: () => Promise<readonly string[]>; readonly client: () => string | undefined; readonly name: string }
export const askedOf = (raw: Readonly<Record<string, unknown>> | undefined): Asked => Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, v === undefined ? undefined : typeof v === 'object' ? JSON.stringify(v) : String(v)]));
/** head behind a door: its lock read, every call answered one at a time and each answer's next read ahead, the same for every door. */
export const headOf = (lock: readonly Said[], root: string, ext: string, door: Door) => {
  const surface = surfaceOf(lock), runs = valueOf(lock, 'runs'), refused = refusedOn(lock, process.platform);
  Object.assign(words, Object.fromEntries((['read', 'view', 'sign', 'land', 'key', 'signer', 'pin', 'topos', 'standing', 'evidence', 'act', 'profile', 'receipts', 'refusal', 'identity'] as const).map((w) => [w, valueOf(lock, `bound/${w}`)])));
  Object.assign(limits, { wait: Number(valueOf(lock, 'bound/wait').split('..')[1]), most: Number(valueOf(lock, 'bound/printed').split('..')[1]) }); Object.assign(birth, { at: valueOf(lock, 'founding/person-at'), file: valueOf(lock, 'founding/birth-file') });
  configureHost(lock, limits);
  /** One call at a time, each after the one before it and never on a timer, so one asked while another lands sees its receipt; a place's reads go to its fold host, which outlives the call and never holds a signer. */
  let [last, ahead]: [Promise<unknown>, AbortController] = [Promise.resolve(), new AbortController()];
  const turn = <T>(act: () => Promise<T>): Promise<T> => ((next) => { last = next.catch(() => undefined); return next; })(last.then(act));
  /** What head refuses through this door, written as every door writes it; a door that reaches for a signing key is one such refusal, named by the lock's line for that key and never by what the door asked. */
  const [refusals, keyRefused] = [refusalsOf(lock, { write: (place, lot) => write(place, lot), now: () => Date.now() }, door.name), shapeOf([sayIn(lock)('signing-key-refused', {})]).cells[0]!.code];
  for (const end of ['SIGTERM', 'SIGINT'] as const) process.once(end, () => void last.then(refusals.settle).finally(() => process.exit(0)));
  /** The person, asked as the client lets head ask; every wait on them is counted, so a time ceiling measures head's work and never the person's. */
  let waited = 0;
  const timed = <A extends unknown[], R>(ask: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => { const t = Date.now(); try { return await ask(...args); } finally { waited += Date.now() - t; } };
  const asked = personOf(lock, door);
  const person = { consent: timed(asked.consent), enter: timed(asked.enter), choose: timed(asked.choose), visit: timed(asked.visit) };
  /** head is its home: the folder of its index of places, and the keychain service its keys live under, one per home, so two heads on one keychain never share a key. A place's root is told to bound by the key id its lock names, its secret kept there under the place's account. */
  const home = process.env[valueOf(lock, 'home/env')] || join(process.env[valueOf(lock, `platform/${process.platform}/home`)] ?? '', valueOf(lock, 'home/folder'));
  const service = `${deviceOf(lock).service}/${basename(home).replace(/[^\w.-]+/g, '-')}`;
  const store = valueOf(lock, `platform/${process.platform}/store`);
  const keys = keychain(service, store, signingOf(lock));
  const devices = new Map<string, string>();
  const device = (role: string): string | undefined => devices.get(role) ?? ((key) => (key === undefined ? undefined : (devices.set(role, key), key)))(keys.held?.(deviceOf(lock, role).account));
  const asRoot = (account: string) => ((device, key) => [key, device.signer, portOf(service, account, store, limits.wait)] as const)(deviceOf(lock), valueOf(lock, 'founding/root').split('/')[1]!);
  const asRole = (role: string, lines: readonly Said[]) => ((one, id) => [id, one.signer, portOf(service, one.account, store, limits.wait)] as const)(deviceOf(lock, role), idIn(lines, device(role)) ?? deviceOf(lock, role).account);
  /** What a call is answered with, one call at a time as when bound blocked head: every bound process it starts is stopped when the client cancels it, and a call cancelled while it waits its turn is never begun. */
  const contextOf = (signal?: AbortSignal): Context => {
    /** One call's folds of a place, kept until something lands in it or is laid there; the places its root acted in, whose receipts close once, when the call ends; and those where anything but a read's receipts landed, as bound printed it. */
    const [folds, touched, moved] = [new Map<string, Promise<never>>(), new Set<string>(), new Set<string>()], forget = (place: string) => { for (const k of [...folds.keys()]) if (k.endsWith(`\0${place}`)) folds.delete(k); };
    const read = (at: string | undefined): boolean => at?.startsWith(`${valueOf(lock, 'receipt/at')}:`) === true;
    const once = <T>(key: string, place: string, fold: () => Promise<T>): Promise<T> => (folds.get(`${key}\0${place}`) ?? ((p) => (folds.set(`${key}\0${place}`, p as Promise<never>), p))(fold())) as Promise<T>;
    const acted = (place: string, root: boolean, done: Promise<Outcome>): Promise<Outcome> => done.then((got) => { if ('lines' in got && !got.lines.every((l) => ((f) => f.kind === 'fact' && read(f.value.fields['at']))(parse(l)))) moved.add(place); return got; }).finally(() => { forget(place); if (root) touched.add(place); });
    const covered = async (place: string, lot: readonly string[], then: () => Promise<Outcome>): Promise<Outcome> => {
      const checked = await authorityAt(place, valueOf(lock, 'founding/root').split('/')[1]!, 'record-coverage', lot, Date.now(), signal);
      return 'refused' in checked ? { refused: checked.refused } : checked.decision !== 'allow' ? { refused: `REFUSE·authority-preflight/${checked.decision} ${checked.needs.join('|')}` } : then();
    };
    return {
      lock,
      bound: (cwd, args) => run(runs, cwd, args, {}, signal),
      standing: (place) => once('standing', place, () => standingAt(runs, place, (lines) => ['head', 'person'].flatMap((role) => ((id) => (id === undefined ? [] : [id]))(idIn(lines, device(role)))), (line) => read(line.at), signal)),
      authority: (place, key, kind, records, presented) => authorityAt(place, key, kind, records, Date.now(), signal, presented),
      policy: (place) => once('policy', place, () => policyAt(runs, place, signal)),
      world: (place, view) => once(`world/${view}`, place, () => settledView(runs, place, view, signal)),
      adapter: async (origin) => ((name) => (!/^[a-z-]+$/.test(name) ? undefined : import(new URL(`../ports/adapters/${name}${ext}`, import.meta.url).href)))(URL.canParse(origin) ? valueOf(lock, `adapter/${new URL(origin).protocol.slice(0, -1)}`) : ''),
      files: { lay: (place, rel, bytes) => { forget(place); layAt(place, rel, bytes); }, drop: (place, rel) => { forget(place); dropAt(place, rel); }, has: hasAt, list: listAt, read: documents, take: takeAt, own: (rel) => takeAt(join(root, rel)) },
      home: () => home,
      personal: () => process.env[valueOf(lock, `platform/${process.platform}/home`)] ?? '',
      found: (place, account) => acted(place, true, founded(runs, place, ...asRoot(account), signal)),
      signRoot: (place, lot, account) => covered(place, lot, () => sign(runs, place, lot, ...asRoot(account), signal)),
      landRoot: (place, lot, account) => acted(place, true, covered(place, lot, () => landAct(runs, place, lot, ...asRoot(account), signal))),
      moved: (place) => moved.has(place),
      settle: async () => { const red: string[] = []; for (const place of touched) { const why = await closing(runs, place, signal); if (why !== undefined) red.push(sayIn(lock)('receipts-open', { place, why })); } touched.clear(); return red; },
      pinned: (place, file) => pinnedAt(runs, place, file, signal),
      access: async (kind) => (kind !== valueOf(lock, 'access/adapter') || !/^[a-z0-9-]+$/.test(kind) ? undefined : import(new URL(`../ports/access/${kind}${ext}`, import.meta.url).href).then((m: { adapter: never }) => m.adapter)),
      person,
      cache: { keep, held },
      signAs: (place, lot, role, lines) => sign(runs, place, lot, ...asRole(role, lines), signal),
      landAs: (place, lot, role, lines) => acted(place, false, landAct(runs, place, lot, ...asRole(role, lines), signal)),
      land: (place, signed) => acted(place, true, land(runs, place, signed, signal)),
      told: (place, signed) => told(runs, place, signed, words.standing, signal),
      elicit: (message) => person.consent(message, aboutOf(lock, 'said/elicit/yes')),
      now: () => Date.now(),
      machine: () => Date.now() - waited,
      begun: Date.now() - waited,
      keys,
      device,
      roots: door.roots, client: door.client,
    };
  };
  const call = (name: string, args: Readonly<Record<string, unknown>> | undefined, signal: AbortSignal): Promise<readonly string[] | undefined> => (ahead.abort(), turn(async () => {
    const tool = surface.tools.find((one) => one.name === name), place = typeof args?.['place'] === 'string' ? args['place'] : '', keyed = (e: Error) => ((key) => { if (key === undefined || !lock.some((l) => l.scope === key)) throw e; return [sayIn(lock)('signing-key-refused', { key, place })]; })(/^REFUSE·keychain (\S+) names a signing key/.exec(e.message)?.[1]);
    if (tool === undefined) return undefined;
    const context = contextOf(signal), answer = refused !== undefined ? [refused] : signal.aborted ? [] : [...await (await answerOf('tools', tool.name))(askedOf(args), context).catch(keyed), ...await context.settle()];
    void ((early) => turn(() => readAhead(shapeOf(answer).cells, contextOf(), early.signal)))(ahead = new AbortController());
    return answer;
  }).then(async (answer) => { if (answer !== undefined && shapeOf(answer).cells.some((c) => c.code === keyRefused)) await refusals.write(typeof args?.['place'] === 'string' ? args['place'] : await placed(), name, digestOf(name, args ?? {}), keyRefused); return answer; }));
  const resource = (uri: string, signal: AbortSignal): Promise<{ readonly mime: string; readonly lines: readonly string[] } | undefined> => turn(async () => {
    const found = surface.resources.flatMap((r) => ((vars) => (vars === undefined ? [] : [{ r, vars }]))(matchTemplate(r.template, uri)))[0];
    if (found === undefined) return undefined;
    if (refused !== undefined) return { mime: found.r.mime, lines: [refused] };
    return { mime: found.r.mime, lines: await (await answerOf('resources', found.r.name))(askedOf(found.vars), contextOf(signal)) };
  });
  /** A place's card now, as do reads it; whether head's index names a place yet, and the one it names; lines head's own key lands in a place, on its standing. */
  const [cardOf, placed] = [(place: string) => turn(() => cardAt(contextOf(), place)), () => turn(() => placeOf({}, contextOf()))];
  const hasPlace = () => turn(async () => ((c) => (!c.files.has(home, LOCK) ? false : c.policy(home).then((held) => !('refused' in held) && held.lines.some((l) => l.scope?.startsWith(`${valueOf(lock, 'home/family')}/`) && l.value !== 'withdraw'))))(contextOf()));
  const write = (place: string, lot: readonly string[]) => turn(async () => ((c) => c.standing(place).then((held) => ('refused' in held ? held : c.landAs(place, lot, 'head', held.lines))))(contextOf()));
  return { surface, call, resource, idle: () => last, cardOf, placed, hasPlace, write, refusals, now: () => contextOf().now() };
};
/** A door that shows no form: its verbs, each answered by its tool through the guard every such door asks, a verb that is no tool carried as its carrier's action; undefined for a verb it lacks. */
export const plainOf = (lock: readonly Said[], root: string, ext: string, name: string) => {
  const [head, verbs, carrier] = [headOf(lock, root, ext, { can: () => ({ url: false, form: false }), elicit: async () => ({ action: 'decline' }), roots: async () => [], client: () => undefined, name }), members(valueOf(lock, 'doors/verbs')), valueOf(lock, 'doors/carrier')];
  const guard = guardOf(lock, head, (verb, args) => ((tool) => head.call(tool ? verb : carrier, tool ? args : { ...args, action: verb }, new AbortController().signal))(head.surface.tools.some((t) => t.name === verb)));
  return { head, verbs, settle: guard.settle, asked: async (verb: string, args: Readonly<Record<string, unknown>> | undefined) => (verbs.includes(verb) ? guard.call(verb, args) : undefined) };
};
