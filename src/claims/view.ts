import { inStanding, type Asked, type Context } from '../core/answer.ts';
import { valueOf, type Said } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';

/** What a place keeps of what was stated, each standing statement with its origin and who else stated the same words: nobody, where only the one who carried it did. */
export const viewed = (asked: Asked, context: Context): Promise<readonly string[]> => inStanding(asked, context, async (place, lines) => {
  const [say, word] = [sayIn(context.lock), (k: string) => valueOf(context.lock, k)], [family, back, via] = [word('claim/family'), word('claim/withdrawn'), word('claim/via')];
  const origin = (l: Said) => (l.at === word('claim/agent/at') ? word('claim/agent') : l.at === word('claim/at') ? word('claim/person') : undefined), words = (l: Said) => l.scope!.split('/')[1];
  const kept = lines.filter((l) => origin(l) !== undefined && l.scope?.startsWith(`${family}/`) && !l.scope.endsWith(`/${back}`) && !lines.some((w) => w.scope === `${l.scope}/${back}`));
  const by = (l: Said) => [...new Set(kept.filter((o) => words(o) === words(l) && origin(o) !== origin(l)).map(origin))].join(', ');
  return kept.length ? kept.map((l) => say(by(l) ? 'claim-backed' : 'claim-alone', { origin: origin(l), said: l.about, carrier: l[via] ?? word('claim/via-unknown'), backers: by(l) })) : [say('claims-none', { place })];
});
