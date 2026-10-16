import { aboutOf, members, valueOf } from './lock.ts';
import type { Said } from './lock.ts';
import { vocabOf } from './read.ts';
import { fill, sayIn } from './surface.ts';

/**
 * How a source proves access, the most trusted first: each flow by the least trusted kind of input it asks, in the order
 * head's lock names — a flow that asks none of them asks no secret — and how many secrets the place's root lets a flow
 * ask on head's page, none unless it signed a ceiling. A source that proves no access says nothing.
 */
export const trustOf = (lock: readonly Said[], lines: readonly Said[], source: string): readonly string[] => {
  const [v, order, asks, root] = [vocabOf(lock), members(valueOf(lock, 'access/trust-order')), valueOf(lock, 'vocab/asks'), valueOf(lock, 'founding/root').split('/')[1]];
  const flows = [...new Set(lines.flatMap((l) => ((parts) => (l.scope?.startsWith(`${v.keys}/${source}/`) && parts.length === v.keys.split('/').length + 2 ? [parts.at(-1)!] : []))(l.scope?.split('/') ?? [])))];
  if (!flows.length) return [];
  const kind = (flow: string) => ((asked) => order.find((k) => asked.includes(k)) ?? 'none')(members(lines.find((l) => l.scope === `${v.keys}/${source}/${flow}` && l.measure === asks)?.value ?? ''));
  const rank = (k: string) => (k === 'none' ? 0 : order.length - order.indexOf(k));
  const ranked = flows.map((flow) => ({ flow, kind: kind(flow) })).sort((a, b) => rank(a.kind) - rank(b.kind) || a.flow.localeCompare(b.flow));
  const allowed = (lines.find((l) => l.scope === valueOf(lock, 'access/secrets') && l.by === root)?.value ?? '0..0').split('..')[1];
  return [sayIn(lock)('trust', { source, flows: ranked.map((f) => fill(aboutOf(lock, `said/trust-${f.kind}`), { flow: f.flow })).join('; '), allowed: allowed ?? '0' })];
};
