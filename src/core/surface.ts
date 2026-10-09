import { aboutOf, below, members, valueOf } from './lock.ts';
import type { Said } from './lock.ts';

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

export const fill = (text: string, asked: Readonly<Record<string, string | undefined>>): string =>
  Object.entries(asked).reduce((at, [name, value]) => (value === undefined ? at : at.split(`{${name}}`).join(value)), text);

export const sayIn = (lock: readonly Said[]) => (key: string, fields: Readonly<Record<string, string | undefined>> = {}): string => fill(aboutOf(lock, `said/${key}`), fields);

export const refusedOn = (lock: readonly Said[], platform: string): string | undefined =>
  ((supported) => (supported.includes(platform) ? undefined : sayIn(lock)('platform', { platform, supported: supported.join('|') })))(members(valueOf(lock, 'platform/supported')));

/** A red, when what head measured ran past a ceiling of its lock in whole seconds: said with the coordinate it ran at; within it, nothing. */
export const redIn = (lock: readonly Said[]) => (scope: string, coordinate: string, started: number, now: number): readonly string[] =>
  ((seconds, ceiling) => (seconds > Number(ceiling.split('..')[1]) ? [sayIn(lock)('red', { coordinate, seconds: String(seconds), scope, ceiling })] : []))(Math.floor((now - started) / 1000), valueOf(lock, scope));

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
