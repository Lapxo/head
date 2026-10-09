import type { Asked, Context } from '../core/answer.ts';
import { planRead } from '../core/read.ts';
import { basisOf, draftOf, receiptsOf, scopeOf, spentOf } from '../core/receipt.ts';
import { redIn, sayIn } from '../core/surface.ts';
import { grantedOf, isOpen } from '../core/act.ts';
import { canonical } from '@lapxo/topos/wire';
import { called } from './call.ts';
import { principalOf } from '../access/obtain.ts';
import type { Frame } from './call.ts';

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
export const readSource = (asked: Asked, context: Context): Promise<readonly string[]> => ((started) => called(asked, context, planRead, async ({ word, say, place, lines, source, operation, plan, prepared, most, typed, attach, send, lands, widen, uncovered }) => {
  const [family, at, when] = [word('receipt/family'), word('receipt/at'), new Date(context.now()).toISOString()];
  const closing = (digest: string): Promise<readonly string[]> => closeWith(asked['closes'], source, digest, { word, lines, lands }, context);
  const scopes = (principal: string) => [scopeOf(family, source, operation, prepared.key, principal), `${scopeOf(word('receipt/kept'), source, operation, prepared.key, principal)}/${basisOf(lines, word, source)}`] as const;
  const held = (digest: string | undefined) => ((bytes) => (bytes === undefined || digest === undefined ? undefined : { digest, bytes }))(digest === undefined ? undefined : context.cache.held(digest));
  const keeping = (kept: string, answer: readonly string[]): readonly string[] => (answer.length > 1 ? [draftOf(word('receipt/kept'), at, kept, context.cache.keep(Buffer.from(answer.join('\n'))), when)] : []);
  const allowed = (key: string, measure: string) => lines.find((l) => l.scope === `${word(key)}/${source}` && l.measure === measure)?.value;
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
    const sources = [...new Set(lines.filter((l) => l.scope?.startsWith(`${word('vocab/region')}/`) && l.measure === word('vocab/origins')).map((l) => l.scope!.split('/')[1]!))].sort();
    const until = new Date(context.now() + Number(word('access/period')) * 86_400_000).toISOString().slice(0, 10);
    const line = (measure: string, value: string) => canonical({ at: 'policy:person/grants', by: 'target', form: 'alphabet', measure, role: 'writes', scope: word('grant/family'), value });
    const granted = await widen(say('grant', { sources: sources.join(', '), place, until })[0]!, [line('sources', sources.join('|')), line('until', until)]);
    if ('said' in granted) return granted.said;
  }
  const reuse = Number(/^\d+\.\.(\d+)$/.exec(allowed('reuse/family', 'seconds') ?? '')?.[1] ?? Number.NaN);
  const [newest] = principal === undefined ? [] : receiptsOf(lines, at, scopes(principal)[0]);
  if (principal !== undefined && newest !== undefined && context.now() - Date.parse(newest.at) <= reuse * 1000) {
    const [scope, kept] = scopes(principal);
    const answered = held(receiptsOf(lines, at, kept).find((k) => k.at >= newest.at)?.digest);
    if (answered !== undefined) return [...new TextDecoder().decode(answered.bytes).split('\n'), ...say('reused', { scope: kept, digest: answered.digest, at: newest.at }), ...(await closing(newest.digest)), ...redIn(context.lock)('answer/kept', `answer/${source}/${operation}@${word('look/call')}`, started, context.machine())];
    const body = held(newest.digest);
    if (body !== undefined) {
      const cut = body.bytes.indexOf(10);
      const answer = await typed(Buffer.from(body.bytes.subarray(0, cut)).toString('utf8'), body.bytes.subarray(cut + 1));
      const keptLines = keeping(kept, answer);
      const landed = keptLines.length ? await lands(...keptLines) : { lines: [] };
      return [...answer, ...say('reread', { scope, digest: body.digest, at: newest.at }), ...('lines' in landed ? landed.lines : []), ...(await closing(body.digest))];
    }
  }
  if (spentOf(lines, family, at, source, context.now()) >= most('read/rate')) return say('rate', { source });
  const attached = await attach();
  if ('said' in attached) return attached.said;
  const [scope, kept] = scopes(attached.principal ?? '');
  const got = await send(attached.attachment);
  if (got.kind !== 'got') return say(got.kind === 'over' ? 'too-large' : 'unreachable-source', { source });
  const digest = context.cache.keep(Buffer.concat([Buffer.from(`${got.status}\n`), got.bytes]));
  const answer = await typed(String(got.status), got.bytes);
  const landed = await lands(draftOf(family, at, scope, digest, when), ...(attached.principal === undefined ? [] : keeping(kept, answer)));
  return [...answer, ...('lines' in landed ? [...landed.lines, ...(await closing(digest))] : say('not-landed', { why: landed.refused }))];
}))(context.machine());
