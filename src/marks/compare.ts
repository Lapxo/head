import { join } from 'node:path';
import type { Asked, Context } from '../core/answer.ts';
import { standingOr } from '../core/answer.ts';
import { members, valueOf, type Said } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';
import { linesOf } from '../core/worlds.ts';
import { readSource } from '../flows/read.ts';
import { shapeOf } from '../ports/surface.ts';

type Read = { readonly source: string; readonly at: string; readonly receipt: string; readonly fields: ReadonlyMap<string, string> };

/** What one source answered the question: its typed fields by name, the hour it said them, and the receipt the read rests on; or what it said instead. */
const readOf = async (asked: Asked, context: Context, place: string, source: string): Promise<Read | { readonly said: readonly string[] }> => {
  const [word, raw] = [(k: string) => valueOf(context.lock, k), await readSource({ ...asked, sources: undefined, source, place }, context)], got = shapeOf(raw);
  const cell = got.cells.filter((c) => ['head/answered', 'head/reused', 'head/kept', 'head/reread'].includes(c.code)).at(-1), family = `${word('receipt/family')}/${source}/`;
  const receipt = got.lines.map((l) => linesOf(new TextEncoder().encode(l))[0]).find((l) => l?.scope?.startsWith(family) && l.measure === 'digest')?.value ?? cell?.fields['receipt'];
  const typed = cell?.code === 'head/kept' ? new TextDecoder().decode(context.cache.held(cell.fields['digest'] ?? '') ?? new Uint8Array()).split('\n') : got.lines;
  const fields = new Map(linesOf(new TextEncoder().encode(typed.join('\n'))).flatMap((l) => ((m) => (m ? [[m[1]!, l.value ?? ''] as const] : []))(new RegExp(`^${word('vocab/answer')}/[0-9a-f]{16}/(.+)$`).exec(l.scope ?? ''))));
  return cell === undefined || receipt === undefined || !fields.size ? { said: raw.filter((l) => l.startsWith('said/')) } : { source, at: cell.fields['at'] ?? '', receipt, fields };
};

/**
 * One question asked of several sources at once — the same operation, the same arguments — and their typed answers
 * compared field by field. Where they agree, the field is marked by the sources that say it, each mark resting on the
 * receipt of its read: ● for each its own, ○ for one that is the same source in another form or declared to share its
 * lineage, with what the place declares of that lineage and nothing more. Where they differ, each is shown with its source
 * and hour, and the loss between them is not measured. None is ever picked.
 */
export const compared = async (asked: Asked, context: Context, place: string): Promise<readonly string[]> => {
  const [say, word, held] = [sayIn(context.lock), (k: string) => valueOf(context.lock, k), await standingOr(context, place)], [own, mark] = [members(word('marks/own-signers')), members(word('marks/mark'))];
  if ('said' in held) return held.said;
  const got = []; for (const source of members(asked['sources'] ?? '')) got.push(await readOf(asked, context, place, source));
  const reads = got.filter((g): g is Read => 'fields' in g), line = (scope: string, measure?: string) => held.lines.find((l) => l.scope === scope && (!measure || l.measure === measure));
  const pinned = (s: string) => linesOf(context.files.take(join(place, line(`uses/${s}`)?.needs ?? '')) ?? new Uint8Array()).filter((l) => l.scope === `${word('vocab/region')}/${s}`);
  const origin = (s: string) => ((region) => ({ origins: members(region.find((l) => l.measure === word('vocab/origins'))?.value ?? ''), pin: region.find((l) => l.measure === word('vocab/documents'))?.value, by: ((b) => (b && !own.includes(b) ? b : undefined))(region.find((l) => l.by)?.by) }))(pinned(s));
  const same = (a: string, b: string) => ((x, y) => x.origins.some((o) => y.origins.includes(o)) || (x.pin !== undefined && x.pin === y.pin) || (x.by !== undefined && x.by === y.by))(origin(a), origin(b));
  const shares = (s: string): readonly string[] | undefined => ((l) => (l === undefined ? undefined : members(l.value ?? '')))(line(`${word('marks/shares')}/${s}`));
  const kin = (s: string, earlier: readonly Read[]) => earlier.find((e) => same(s, e.source) || shares(s)?.includes(e.source) || shares(e.source)?.includes(s));
  return [...got.flatMap((g) => ('said' in g ? g.said : [])), ...[...new Set(reads.flatMap((r) => [...r.fields.keys()]))].flatMap((field) => {
    const values = reads.filter((r) => r.fields.has(field));
    if (new Set(values.map((r) => r.fields.get(field))).size > 1)
      return [...values.map((r) => say('forked', { field, source: r.source, value: r.fields.get(field), at: r.at })), say('unmeasured', { what: `${word('marks/loss')} ${values.map((r) => r.source).join(', ')}`, needs: word('marks/loss-needs') })];
    if (values.length < 2 || values.length < reads.length) return values.map((r) => say('partial', { field, source: r.source, value: r.fields.get(field), at: r.at }));
    const kinOf = values.map((r, i) => kin(r.source, values.slice(0, i))), first = kinOf.findIndex((k) => k !== undefined);
    const base = { field, value: values[0]!.fields.get(field), sources: values.map((r) => r.source).join(', '), marks: kinOf.map((k) => (k ? mark[1] : mark[0])).join(''), receipts: values.map((r) => r.receipt).join('|') };
    return [first >= 0 ? say('agreed-lineage', { ...base, source: values[first]!.source, other: kinOf[first]!.source })
      : values.every((r) => line(`${word('marks/shares')}/${r.source}`)?.value === word('marks/undeclared')) ? say('agreed-undeclared', base) : say('agreed-unknown', base)];
  })];
};
