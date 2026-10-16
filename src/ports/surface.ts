import { aboutOf, below, members, valueOf } from '../core/lock.ts';
import type { Said } from '../core/lock.ts';
import { sayIn } from '../core/surface.ts';

export interface Field { readonly name: string; readonly about: string; readonly type: string; readonly required: boolean }
export interface Tool { readonly name: string; readonly about: string; readonly fields: readonly Field[]; readonly hints: readonly string[] }
export interface Resource { readonly name: string; readonly about: string; readonly template: string; readonly mime: string }
export interface Prompt { readonly name: string; readonly about: string; readonly text: string; readonly line: string; readonly fields: readonly Field[] }
export interface Surface { readonly name: string; readonly version: string; readonly tools: readonly Tool[]; readonly resources: readonly Resource[]; readonly prompts: readonly Prompt[] }

const nameOf = (line: Said): string => line.scope!.split('/')[1]!;
const fieldsOf = (lock: readonly Said[], scope: string): readonly Field[] => ((required) => members(valueOf(lock, scope)).map((name) => ({
  name, about: aboutOf(lock, `${scope}/${name}`), type: valueOf(lock, `${scope}/${name}`), required: required.includes(name) })))(members(valueOf(lock, `${scope}/required`)));

/** Everything a client is offered, read off the lock alone: its tools, resources and prompts, each with the words a model sees. */
export const surfaceOf = (lock: readonly Said[]): Surface => ({
  name: valueOf(lock, 'name'), version: valueOf(lock, 'version'),
  tools: below(lock, 'tool').map((line) => ({ name: nameOf(line), about: line.about ?? '', fields: fieldsOf(lock, line.scope!), hints: members(valueOf(lock, `${line.scope}/hints`)) })),
  resources: below(lock, 'resource').map((line) => ({ name: nameOf(line), about: line.about ?? '', template: line.value ?? '', mime: valueOf(lock, `${line.scope}/mime`) })),
  prompts: below(lock, 'prompt').map((line) => ({ name: nameOf(line), about: line.about ?? '', text: aboutOf(lock, `${line.scope}/text`), line: aboutOf(lock, `${line.scope}/line`), fields: fieldsOf(lock, line.scope!) })),
});

export const refusedOn = (lock: readonly Said[], platform: string): string | undefined =>
  ((supported) => (supported.includes(platform) ? undefined : sayIn(lock)('platform', { platform, supported: supported.join('|') })))(members(valueOf(lock, 'platform/supported')));

/**
 * The fields a URI gives a resource template, or none when it is not one of its URIs: {name} matches one path step,
 * {?a,b} names query fields any of which may be absent, in any order, each decoded.
 */
export const matchTemplate = (template: string, uri: string): Readonly<Record<string, string>> | undefined => {
  const [path = '', query = ''] = template.split('{?');
  const names = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
  const pattern = new RegExp(`^${path.split(/\{\w+\}/).map((part) => part.replace(/[.*+?^$()|[\]\\]/g, '\\$&')).join('([^/?#]+)')}(?:\\?(.*))?$`);
  const got = pattern.exec(uri);
  if (got === null) return undefined;
  const params = new URLSearchParams(got[names.length + 1] ?? '');
  return { ...Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(got[i + 1]!)])),
    ...Object.fromEntries(query.replace('}', '').split(',').filter(Boolean).flatMap((name) => ((v) => (v === null ? [] : [[name, v]]))(params.get(name)))) };
};

export interface Cell { readonly code: string; readonly state: string; readonly next: { readonly tool: string; readonly args: Readonly<Record<string, string>> } | { readonly none: string }; readonly fields: Readonly<Record<string, string>>; readonly head?: string }
/** A said code as the cell head answers with: its state and next from the lock, the next's arguments read from the cell's own fields; a bound refusal a field carries keeps bound's code, head's own beside it. */
export const cellOf = (lock: readonly Said[], key: string, given: Readonly<Record<string, string | undefined>>): Cell => {
  const fields = Object.fromEntries(Object.entries(given).filter((e): e is [string, string] => e[1] !== undefined)), bound = Object.values(fields).map((v) => /^REFUSE·[\w-]+/.exec(v)?.[0]).find(Boolean);
  const [tool, args] = [valueOf(lock, `said/${key}/next`), members(valueOf(lock, `said/${key}/next/args`)).map((a) => ((k, v) => [k, v.startsWith('$') ? fields[v.slice(1)] ?? '' : v] as const)(a.split(':')[0]!, a.slice(a.indexOf(':') + 1)))];
  return { code: bound ?? `head/${key}`, state: valueOf(lock, `said/${key}/state`), next: tool === 'none' ? { none: aboutOf(lock, `said/${key}/next`) } : { tool, args: Object.fromEntries(args) }, fields, ...(bound ? { head: `head/${key}` } : {}) };
};
export const cellLine = (cell: Cell): string => [`said/${cell.code} state=${cell.state}`, ...('tool' in cell.next ? [`next=${cell.next.tool}`, ...Object.entries(cell.next.args).map(([k, v]) => `next.${k}=${JSON.stringify(v)}`)] : ['next=none', `next.why=${JSON.stringify(cell.next.none)}`]),
  ...(cell.head ? [`head=${JSON.stringify(cell.head)}`] : []), ...Object.entries(cell.fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`)].join(' ');
/** An answer as cells and the lines bound printed beside them, read back from what head said: the shape every tool result has. */
export const shapeOf = (answer: readonly string[]): { readonly cells: readonly Cell[]; readonly lines: readonly string[] } => ({ lines: answer.filter((l) => !l.startsWith('said/')),
  cells: answer.filter((l) => l.startsWith('said/')).map((l) => ((code, rest) => ((t) => ({ code, state: t['state'] ?? '', next: t['next'] === 'none' || t['next'] === undefined ? { none: t['next.why'] ?? '' } : { tool: t['next'], args: Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('next.')).map(([k, v]) => [k.slice(5), v])) },
    fields: Object.fromEntries(Object.entries(t).filter(([k]) => !['state', 'next', 'head'].includes(k) && !k.startsWith('next.'))), ...(t['head'] ? { head: t['head'] } : {}) }))(Object.fromEntries([...rest.matchAll(/(\S+?)=("(?:[^"\\]|\\.)*"|\S+)/g)].map((m) => [m[1]!, m[2]!.startsWith('"') ? JSON.parse(m[2]!) as string : m[2]!]))))(l.slice('said/'.length, l.indexOf(' ')), l.slice(l.indexOf(' ') + 1))) });
/** The one output schema every tool declares: cells in the states the lock names, and the lines bound printed. */
export const shapeSchema = (lock: readonly Said[]) => ({ type: 'object' as const, required: ['cells', 'lines'], properties: {
  cells: { type: 'array', items: { type: 'object', required: ['code', 'state', 'next', 'fields'], properties: { code: { type: 'string' }, state: { enum: [...members(valueOf(lock, 'shape/states'))] }, head: { type: 'string' },
    next: { oneOf: [{ type: 'object', required: ['tool', 'args'], properties: { tool: { type: 'string' }, args: { type: 'object', additionalProperties: { type: 'string' } } } }, { type: 'object', required: ['none'], properties: { none: { type: 'string' } } }] },
    fields: { type: 'object', additionalProperties: { type: 'string' } } } } },
  lines: { type: 'array', items: { type: 'string' } } } });
