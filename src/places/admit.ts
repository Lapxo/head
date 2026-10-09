import { parse } from '@lapxo/topos/wire';
import { inPlace, standingOr, unless } from '../core/answer.ts';
import type { Asked, Context } from '../core/answer.ts';
import { admissionOf, idIn } from '../core/device.ts';
import { valueOf } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { rootIn } from '../flows/device.ts';

/**
 * Another device admitted into a place by whoever holds its root, once they said yes: the public key its own lines hand
 * over — what those lines claim it may sign is not read — admitted under the name given here, covering what is given here
 * or, without it, what a member is covered for: it asks, keeps what it read and proves access, and widens nothing.
 */
export const admitted = (asked: Asked, context: Context): Promise<readonly string[]> => inPlace(asked, context, async (place) => {
  const say = sayIn(context.lock), word = (k: string) => valueOf(context.lock, k);
  const name = (asked['name'] ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const key = (asked['key'] ?? '').split('\n').map((line) => parse(line.trim())).flatMap((got) => (got.kind === 'fact' && got.value.fields['measure'] === 'public-key' ? [got.value.fields['value'] ?? ''] : []))[0];
  if (!name || !key) return [say('no-key')];
  const [root, held] = [rootIn(context, place), await standingOr(context, place)];
  if ('said' in root) return root.said;
  if ('said' in held) return held.said;
  if (held.lines.some((l) => l.scope === `keys/${name}`) || idIn(held.lines, key) !== undefined) return [say('key-taken', { name, place })];
  const coverage = asked['coverage'] || word('member/coverage');
  const refused = await unless(context, say('elicit-admit', { name, place, coverage }));
  if (refused) return refused;
  const lot = admissionOf(context.lock, key, 'head', { id: name, coverage, at: `policy:head/admit/${new Date(context.now()).toISOString()}` });
  const landed = await context.landRoot(place, lot, root.account);
  return 'refused' in landed ? [say('not-landed', { why: landed.refused })] : [say('admitted', { name, place, coverage }), ...landed.lines];
});
