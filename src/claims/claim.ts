import { createHash } from 'node:crypto';
import { canonical } from '@lapxo/topos/wire';
import { inPlace, standingOr, unless, type Asked, type Context } from '../core/answer.ts';
import { uncoveredIn } from '../core/device.ts';
import { aboutOf, members, valueOf } from '../core/lock.ts';
import { fill, sayIn } from '../core/surface.ts';

/** Whether the person said, in this conversation, that what they state in a place is kept as theirs: asked once a place, a no kept as a yes is. */
const answered = new Map<string, boolean>();

/**
 * What the person states, kept as theirs: a line their own key attests, their words exactly as given, in the place named;
 * asked once a conversation whether what they state there is kept, and each statement said back as it goes in, so they see
 * it, with who carried it here as the client says it is. Taken back by the same words: what a person attests is evidence, and
 * stands for good, so taking it back is attesting that, beside it. A place whose lines admit no carrier is handed the line that does.
 * Only this action keeps one, never a cell, an answer or a read ahead, so nothing the model concluded becomes the person's.
 */
export const claimed = (asked: Asked, context: Context): Promise<readonly string[]> => inPlace(asked, context, async (place) => {
  const [say, word, said, held] = [sayIn(context.lock), (k: string) => valueOf(context.lock, k), (asked['said'] ?? '').trim(), await standingOr(context, place)];
  if ('said' in held) return held.said;
  if (!said) return [say('missing-param', { operation: 'claim', param: 'said' })];
  const [family, withdraw, back] = [`${word('claim/family')}/${createHash('sha256').update(said).digest('hex').slice(0, 16)}`, asked['withdraw'] === 'true', word('claim/withdrawn')];
  const standing = held.lines.filter((l) => l.scope?.startsWith(`${family}/`) && !l.scope.endsWith(`/${back}`) && !held.lines.some((w) => w.scope === `${l.scope}/${back}`)).map((l) => l.scope!);
  if (withdraw && !standing.length) return [say('claim-none', { place, said })];
  const wire = held.lines.find((l) => l.scope === 'wire/fields'), via = word('claim/via');
  const bare = wire && Object.fromEntries(Object.entries(wire).filter(([k]) => !['sig', 'epoch', 'about'].includes(k)));
  if (bare && !members(wire.value ?? '').includes(via)) return [say('claims-unadmitted', { place, lines: [canonical({ ...bare, by: 'target', value: 'withdraw' }), canonical({ ...bare, by: 'target', at: `policy:head/wire/${new Date(context.now()).toISOString()}`, value: `${wire.value}|${via}` })].join('\n') })];
  const line = (scope: string) => canonical({ about: said, at: word('claim/at'), by: 'target', form: 'alphabet', measure: 'text', role: 'writes', scope, value: 'lock', [via]: context.client() ?? word('claim/via-unknown') });
  const lot = withdraw ? standing.map((scope) => line(`${scope}/${back}`)) : [line(`${family}/${new Date(context.now()).toISOString().replace(/\D/g, '')}`)], outside = uncoveredIn(context.lock, held.lines, context.device('person'), place, lot);
  if (outside) return outside;
  if (!withdraw && !answered.has(place)) answered.set(place, (await unless(context, fill(aboutOf(context.lock, 'said/elicit-claims'), { place }))) === undefined);
  if (!withdraw && !answered.get(place)) return [say('claims-declined', { place, said })];
  const landed = await context.landAs(place, lot, 'person', held.lines);
  return 'refused' in landed ? [say('not-landed', { why: landed.refused })] : [say(withdraw ? 'unclaimed' : 'claimed', { place, said }), ...landed.lines];
});
