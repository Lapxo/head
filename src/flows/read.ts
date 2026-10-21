import { under } from '../core/lock.ts';
import type { Asked, Context } from '../core/answer.ts';
import { observedAt, planRead } from '../core/read.ts';
import { basisOf, draftOf, receiptsOf, scopeOf } from '../core/receipt.ts';
import { redIn, sayIn } from '../core/surface.ts';
import { grantedOf, isOpen, untilOf } from '../core/act.ts';
import { canonical } from '@lapxo/topos/wire';
import { calledByName as called } from '../use/named.ts';
import { principalOf } from '../access/obtain.ts';
import { jsonOf } from '../access/contract.ts';
import type { Frame } from './call.ts';
import { refusedAccess } from '../sources/refused.ts';
import { hand, keptOf } from '../kept/kept.ts';
import { markOf, overOf } from '../ahead/budget.ts';

/** An intent an earlier act left open, closed by the read that looked at what it would have changed: a line naming that read-s digest, signed by head. */
const closeWith = async (intent: string | undefined, source: string, digest: string, { word, lines, lands }: Pick<Frame, 'word' | 'lines' | 'lands'>, context: Context): Promise<readonly string[]> => {
  const say = sayIn(context.lock);
  if (!intent) return [];
  if (!intent.startsWith(`${word('act/family')}/${source}/`) || !isOpen(lines, intent, [word('act/done'), word('act/closed')])) return [say('nothing-open', { intent })];
  const landed = await lands(draftOf('', word('receipt/at'), `${intent}/${word('act/closed')}`, digest, new Date(context.now()).toISOString()));
  return 'refused' in landed ? [say('not-landed', { why: landed.refused })] : [...landed.lines, say('closed', { intent, digest })];
};

/**
 * A read of one offer the place declares of the class head reads: the response comes back once, typed by the world,
 * and both are kept — the body's digest and the typed answer's, receipts the device key signs. Asked again as the same
 * principal, while the place stands on what typed it, the person's grant holds now and the newest read is younger than
 * the reuse the place allows, it answers from what was kept: nothing called. Asked for history, it shows what was kept
 * of that request as of when it was read — evidence of that read, never a current answer — where the place allows it.
 */
export const readSource = (asked: Asked, context: Context): Promise<readonly string[]> => called(asked, context, planRead, async ({ word, say, place, lines, source, operation, plan, prepared, most, typed, attach, send, lands, widen, uncovered }) => {
  const [family, at, when] = [word('receipt/family'), word('receipt/at'), new Date(context.now()).toISOString()];
  const closing = (digest: string): Promise<readonly string[]> => closeWith(asked['closes'], source, digest, { word, lines, lands }, context);
  const scopes = (principal: string) => [scopeOf(family, source, operation, prepared.key, principal), `${scopeOf(word('receipt/kept'), source, operation, prepared.key, principal)}/${basisOf(lines, word, source)}`] as const;
  const held = (digest: string | undefined) => ((bytes) => (bytes === undefined || digest === undefined ? undefined : { digest, bytes }))(digest === undefined ? undefined : context.cache.held(digest));
  const keeping = (kept: string, answer: readonly string[]): readonly string[] => (answer.length > 1 ? [draftOf(word('receipt/kept'), at, kept, (asked['ahead'] === 'true' ? String : hand)(context.cache.keep(Buffer.from(answer.join('\n')))), when)] : []);
  const allowed = (key: string, measure: string) => (lines.find((l) => l.scope === `${word(key)}/${source}` && l.measure === measure) ?? lines.find((l) => l.scope === word(key) && l.measure === measure))?.value;
  if (asked['why'] === 'true') {
    const asOf = principalOf(context, plan, false), [newest] = asOf === undefined ? [] : receiptsOf(lines, at, scopes(asOf)[0]), pin = lines.find((l) => l.scope === `uses/${source}`);
    const signed = newest && lines.find((l) => l.scope === newest.scope && l.value === newest.digest && l.at === `${at}:${newest.at}`), worlds = lines.filter((l) => l.scope?.startsWith('uses/') && (!l.needs || under(context.lock, 'place/worlds', l.needs))).map((l) => `${l.scope!.slice('uses/'.length)} ${l.value}`);
    return newest === undefined ? say('why-none', { source, operation }) : say('why', { source, operation, origin: plan.origin, at: newest.at, by: signed?.by ?? '', epoch: signed?.epoch ?? '', digest: newest.digest, pin: pin?.value ?? '', pinned: pin?.epoch ?? '', worlds: worlds.join(', ') });
  }
  if (asked['history'] === 'true') {
    const asOf = principalOf(context, plan, false);
    if (allowed('history/family', 'status') !== 'present') return [...say('history-undeclared', { place, source }), canonical({ at: 'policy:person/history', by: 'target', form: 'alphabet', measure: 'status', role: 'writes', scope: `${word('history/family')}/${source}`, value: 'present' })];
    const [newest, ...earlier] = asOf === undefined ? [] : receiptsOf(lines, at, scopes(asOf)[0]);
    if (newest === undefined) return say('history-none', { source, operation });
    const keptThen = receiptsOf(lines, at, scopeOf(word('receipt/kept'), source, operation, prepared.key, asOf!), true).find((k) => k.at === newest.at);
    const typedThen = held(keptThen?.digest);
    return [...say('history', { source, operation, at: newest.at, digest: newest.digest }), ...(typedThen ? new TextDecoder().decode(typedThen.bytes).split('\n') : say(keptThen ? 'history-gone' : 'history-untyped')),
      ...earlier.flatMap((r) => say('history-earlier', { source, at: r.at, digest: r.digest }))];
  }
  const principal = principalOf(context, plan);
  const stopped = uncovered('head', scopes(principal ?? ''));
  if (stopped) return stopped;
  if (!grantedOf(lines, word('grant/family'), source, context.now())) {
    if (asked['ahead'] === 'true') return [];
    const sources = [...new Set(lines.filter((l) => l.scope?.startsWith(`${word('vocab/region')}/`) && l.measure === word('vocab/origins')).map((l) => l.scope!.split('/')[1]!))].sort();
    const until = untilOf(word('access/period'), context.now());
    const line = (measure: string, value: string) => canonical({ at: `policy:person/grants/${new Date(context.now()).toISOString()}`, by: 'target', form: 'alphabet', measure, role: 'writes', scope: word('grant/family'), value });
    const before = [...new Set(lines.filter((l) => l.scope === word('grant/family')).map(({ about: _about, sig: _sig, epoch: _epoch, ...l }) => canonical({ ...l, by: 'target', value: 'withdraw' })))];
    const granted = await widen(say('grant', { sources: sources.join(', '), place, until })[0]!, [...before, line('sources', sources.join('|')), line('until', until)]);
    if ('said' in granted) return granted.said;
  }
  const was = principal === undefined ? undefined : keptOf(lines, at, scopes(principal), grantedOf(lines, word('grant/family'), source, context.now()), allowed('reuse/family', 'seconds'), context.now(), held);
  if (was?.kind === 'kept') return [...(was.bytes ? [...new TextDecoder().decode(was.bytes).split('\n'), ...say('reused', { scope: scopes(principal!)[1], digest: hand(was.digest), at: was.at, receipt: was.receipt })] : say('kept', { source, operation, at: was.at, digest: was.digest, receipt: was.receipt })),
    ...(await closing(was.receipt)), ...redIn(context.lock)('answer/kept', `answer/${source}/${operation}`, context.begun, context.machine())];
  if (was?.kind === 'reread') {
    const answer = await typed(Buffer.from(was.bytes.subarray(0, was.bytes.indexOf(10))).toString('utf8'), was.bytes.subarray(was.bytes.indexOf(10) + 1)), keptLines = keeping(scopes(principal!)[1], answer);
    const landed = keptLines.length ? await lands(...keptLines) : { lines: [] };
    return [...answer, ...say('reread', { scope: scopes(principal!)[0], digest: was.digest, at: was.at, receipt: was.digest }), ...('lines' in landed ? landed.lines : []), ...(await closing(was.digest))];
  }
  const again = was?.kind === 'again' ? say(`kept-${was.why}`, { source, operation, at: was.at }) : [];
  if (overOf(lines, [family, at, word('ahead/mark')], source, context.now(), most('read/rate'), Number(word('ahead/share').split('..')[1]), asked)) return asked['ahead'] === 'true' ? [] : say('rate', { source });
  const attached = await attach();
  if ('said' in attached) return attached.said;
  const [scope, kept] = scopes(attached.principal ?? '');
  const got = await send(attached.attachment);
  if (asked['ahead'] === 'true' && (got.kind !== 'got' || got.status >= 300)) return [];
  if (got.kind !== 'got') return say(got.kind === 'over' ? 'too-large' : 'unreachable-source', { source, why: got.kind === 'failed' ? got.why : '' });
  if (got.status === 401 && attached.principal !== 'anonymous') return refusedAccess(context, place, lines, plan, operation);
  const digest = context.cache.keep(Buffer.concat([Buffer.from(`${got.status}\n`), got.bytes]));
  const answer = await typed(String(got.status), got.bytes);
  const observed = plan.access.probe && got.status < 300 ? [canonical({ at: `${at}:${when}`, by: 'target', form: 'alphabet', measure: word('vocab/access'), role: 'writes', scope: observedAt(context.lock, source, operation), value: word('vocab/anonymous') })] : [];
  const found = plan.access.probe && got.status === 401 && got.authenticate ? await (await context.access(word('access/adapter')))?.discover?.(plan.origin, got.authenticate, async (url) => jsonOf((await context.files.read.documentOf(context, place, url))?.bytes ?? new Uint8Array())) : undefined;
  const by = `${word('access/family')}/${source}/${word('access/authorizer')}`, authorizer = Object.entries(found ?? {}).flatMap(([k, f]) => Object.entries(f).map(([measure, all]) => canonical({ at: `${at}:${when}`, by: 'target', form: 'alphabet', measure, role: 'writes', scope: k ? `${by}/${k}` : by, value: all.join('|') })));
  const landed = await lands(draftOf(family, at, scope, digest, when), ...markOf(asked, [at, word('ahead/mark')], scope, digest, when), ...(attached.principal === undefined ? [] : keeping(kept, answer)), ...observed, ...authorizer);
  return [...again, ...answer, ...('lines' in landed ? [...landed.lines, ...(await closing(digest))] : say('not-landed', { why: landed.refused })), ...(found?.['']?.['issuer'] && 'lines' in landed ? say('authorizer-observed', { source, issuer: found['']['issuer'][0]! }) : [])];
});
