import { canonical } from '@lapxo/topos/wire';
import type { Context } from '../core/answer.ts';
import { valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import { fieldsOf, vocabOf } from '../core/read.ts';

/**
 * What a source answered, as the world types it: the body is laid in the place's answers for as long as bound reads it,
 * then taken away, and only the lines the world answers for this request come back — a value of each declared field, the
 * counts, what it held back. A place that names no view to type it gets no answer at all, never the body.
 */
export const typedAnswer = async (context: Context, place: string, lines: readonly Said[], source: string, operation: string, key: string, body: Uint8Array): Promise<{ readonly lines: readonly string[] } | { readonly untyped: string }> => {
  const v = vocabOf(context.lock), models = fieldsOf(lines, `${v.offers}/${source}/${operation}/${v.form}`)['answer-view'] ?? [];
  if (models.length > 1 || models.some(model => !/^[a-z][a-z0-9-]*$/.test(model))) return { untyped: 'answer/model-ambiguous' };
  const view = models[0] ?? valueOf(context.lock, 'place/answer');
  if (!lines.some((line) => line.scope === `view/${view}` && line.role === 'demands')) return { untyped: 'answer/model-not-admitted' };
  const [request, family] = [key.slice(0, 16), valueOf(context.lock, 'vocab/answer')];
  const at = `${valueOf(context.lock, 'place/answers')}/${source}/${encodeURIComponent(operation).replaceAll('.', '%2E')}/${request}.json`;
  context.files.lay(place, at, body);
  try {
    const got = await context.world(place, view);
    if ('refused' in got) return { untyped: got.refused };
    const mine = got.lines.filter((line) => line.scope === `${family}/${request}` || line.scope?.startsWith(`${family}/${request}/`));
    return mine.length ? { lines: mine.map((line) => canonical(line)).sort() } : { untyped: '' };
  } finally { context.files.drop(place, at); }
};
