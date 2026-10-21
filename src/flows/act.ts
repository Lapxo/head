import type { Asked, Context } from '../core/answer.ts';
import { actsOf, allowedOf, askedOf, cappedOf } from '../core/act.ts';
import { planAct } from '../core/read.ts';
import { draftOf } from '../core/receipt.ts';
import { sayIn } from '../core/surface.ts';
import { canonical } from '@lapxo/topos/wire';
import { called } from './call.ts';

/** Run one action within its declared authority, with the person's approval when required. */
export const act = (asked: Asked, context: Context): Promise<readonly string[]> => called(asked, context, planAct, async ({ word, say, lines, source, operation, prepared, typed, attach, send, lands, widen, uncovered }) => {
  const [family, done] = [word('act/family'), word('act/done')];
  const allowed = allowedOf(lines, word('allow/family'), source, operation);
  const scope = `${family}/${source}/${operation}/${prepared.key.slice(0, 16)}`;
  const acts = actsOf(lines, family, [done, word('act/closed')], source, operation, prepared.key);
  if (acts.open) return say('open', { source, operation, intent: scope });
  const stopped = uncovered('head', [scope, `${scope}/${done}`]);
  if (stopped) return stopped;
  const capped = cappedOf(lines, word('allow/family'), source, operation);
  if (capped && acts.done >= allowed) return say('not-allowed', { source, operation, allowed: String(allowed), done: String(acts.done) });
  if (!capped || askedOf(lines, word('ask/family'), source, operation)) {
    const yes = await widen(sayIn(context.lock)('elicit-act', { source, operation, call: prepared.describe }), [canonical({ at: 'policy:person/allows', by: 'target', form: 'alphabet', measure: 'status', role: 'writes', scope: `${word('allow/family')}/${source}/${operation}/${prepared.key.slice(0, 16)}`, value: 'present' })]);
    if ('said' in yes) return yes.said;
  }
  const attached = await attach();
  if ('said' in attached) return attached.said;
  const when = () => new Date(context.now()).toISOString();
  const intended = await lands(canonical({ at: `${word('receipt/at')}:${when()}`, by: 'target', form: 'alphabet', measure: 'status', role: 'writes', scope, value: 'present' }));
  if ('refused' in intended) return say('not-landed', { why: intended.refused });
  const got = await send(attached.attachment);
  if (got.kind !== 'got') return say('act-failed', { source, operation, intent: scope });
  const landed = await lands(draftOf(family, word('receipt/at'), `${scope}/${done}`, context.cache.keep(Buffer.concat([Buffer.from(`${got.status}\n`), got.bytes])), when()));
  const answer = await typed(String(got.status), got.bytes);
  return 'refused' in landed ? [...answer, ...say('not-landed', { why: landed.refused })] : [...answer, ...intended.lines, ...landed.lines];
});
